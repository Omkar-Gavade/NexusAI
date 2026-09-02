import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/render';
import { sessionKey } from '@/features/auth/use-session';
import { useThemeStore } from '@/stores/theme-store';
import { useUIStore } from '@/stores/ui-store';
import { Header } from './header';

vi.mock('@/features/auth/api', () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  changePassword: vi.fn(),
}));
vi.mock('@/features/conversations/use-conversations', () => ({
  useDeleteConversation: () => ({ mutate: vi.fn(), isPending: false }),
  conversationsKey: ['conversations'],
}));

/**
 * The global controls live in the header rather than the sidebar because the
 * sidebar collapses to a rail; identity and theme must stay reachable.
 */
/** Reports the router's location so a navigation can be asserted. */
function Location() {
  const { pathname } = useLocation();
  return <span data-testid="location">{pathname}</span>;
}

function setup() {
  const client = createTestQueryClient();
  client.setQueryData(sessionKey, {
    user: {
      id: 'u',
      email: 'ada@example.test',
      displayName: 'Ada',
      preferences: { theme: 'dark' as const, routingMode: 'balanced' as const, pinnedModelId: null },
      createdAt: new Date().toISOString(),
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app/chat/c1']}>
        <Header title="A conversation" conversationId="c1" />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useThemeStore.setState({ preference: 'dark', resolved: 'dark' });
  useUIStore.getState().closeDialog();
});

describe('header controls', () => {
  it('offers a theme control that names where it is going', () => {
    setup();
    // Not "dark theme", which is ambiguous about what pressing it does.
    expect(screen.getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument();
  });

  it('switches theme on press', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(useThemeStore.getState().resolved).toBe('light');
  });

  it('identifies the signed-in account', () => {
    setup();
    expect(screen.getByRole('button', { name: /account: ada/i })).toBeInTheDocument();
  });

  it('opens settings from the account menu', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /account: ada/i }));
    await user.click(await screen.findByRole('menuitem', { name: /settings/i }));
    expect(useUIStore.getState().dialog).toBe('settings');
  });

  /*
   * Signing out used to leave the person on `/login?next=/app/chat/c1` — a
   * sign-in form pre-aimed back at the session they had just ended. Clearing
   * the query cache drops the session, `RequireAuth` re-renders with no user,
   * and its redirect won the race. The navigation is inside `useLogout` now,
   * before the clear, so all three sign-out controls behave the same way.
   */
  it('returns to the home page on sign out', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/chat/c1');

    await user.click(screen.getByRole('button', { name: /account: ada/i }));
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'));
    expect(screen.getByTestId('location')).not.toHaveTextContent('/login');
  });

  it('offers only actions the backend actually supports', async () => {
    // No "Change password", no "Billing", no plausible-looking entries the
    // product cannot honour. The backend exposes settings and sign-out.
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /account: ada/i }));
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent?.trim());
    expect(items).toEqual(['Settings', 'Sign out']);
  });
});
