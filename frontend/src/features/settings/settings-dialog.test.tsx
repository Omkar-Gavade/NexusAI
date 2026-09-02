import { QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/render';
import { sessionKey } from '@/features/auth/use-session';
import { SettingsDialog } from './settings-dialog';

vi.mock('@/features/auth/api', () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
}));
const api = await import('@/features/auth/api');

const session = (routingMode: 'single' | 'balanced' | 'thorough') => ({
  user: {
    id: 'u',
    email: 'a@b.co',
    displayName: 'Ada',
    preferences: { theme: 'system' as const, routingMode, pinnedModelId: null },
    createdAt: new Date().toISOString(),
  },
});

function setup(routingMode: 'single' | 'balanced' | 'thorough' = 'balanced') {
  const client = createTestQueryClient();
  client.setQueryData(sessionKey, session(routingMode));
  return {
    client,
    ...rtlRender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SettingsDialog open onClose={() => undefined} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => vi.mocked(api.updateProfile).mockReset());

describe('settings', () => {
  it('shows the routing mode the account actually holds', () => {
    setup('thorough');
    expect(screen.getByRole('radio', { name: /synthesis · 5 models/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /synthesis · 3 models/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  /*
   * The dialog called these Balanced and Thorough while the composer's selector
   * called the same three settings Single model, Synthesis · 3 models and
   * Synthesis · 5 models. One setting described in two vocabularies is how a
   * user comes to believe there are two settings, so the strings are now
   * identical — and this is the assertion that keeps them so.
   */
  it('names the routing modes exactly as the composer selector does', () => {
    setup('balanced');
    for (const label of ['Single model', 'Synthesis · 3 models', 'Synthesis · 5 models']) {
      expect(screen.getByRole('radio', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  /*
   * Sign out is the one irreversible control here. It used to sit under ACCOUNT
   * directly beneath the read-only name and email; it now has its own group,
   * last, and says what it ends.
   */
  it('separates the session controls from the account details', () => {
    const { container } = setup('balanced');
    const labels = [...container.querySelectorAll('section')].map(
      (section) => section.textContent ?? '',
    );

    const account = labels.findIndex((t) => t.startsWith('ACCOUNT'));
    const session = labels.findIndex((t) => t.startsWith('SESSION'));

    expect(account).toBeGreaterThanOrEqual(0);
    expect(session).toBeGreaterThan(account);
    expect(labels[session]).toMatch(/sign out/i);
    expect(labels[account]).not.toMatch(/sign out/i);
  });

  it('persists a routing change through the profile endpoint', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateProfile).mockResolvedValue(session('single'));

    setup('balanced');
    await user.click(screen.getByRole('radio', { name: /single model/i }));

    // Asserted on the first argument only: React Query passes a second
    // context argument to mutationFn that is not part of this contract.
    await waitFor(() => {
      expect(vi.mocked(api.updateProfile).mock.calls[0]?.[0]).toEqual({
        preferences: { routingMode: 'single' },
      });
    });

    // The response replaces the session, so the control reflects the saved value.
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /single model/i })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });

  /*
   * Not covered here: the failed-save branch.
   *
   * The dialog does render "could not be saved" and does leave the previous
   * radio selected — confirmed by running it. But driving it needs a rejected
   * mutation, and that rejection escapes into Vitest's unhandled-rejection
   * reporter and fails the file even though every assertion passes. Marking the
   * promise handled and declaring `onError` both failed to contain it. Left
   * uncovered and stated, rather than shipped as a red test or as a green one
   * that asserts nothing.
   */

  it('offers no control for a preference the backend stores but never reads', () => {
    // `pinnedModelId` is persisted and updatable, and nothing anywhere consumes
    // it — not the orchestrator, not the chat route, not this client. A control
    // for it would appear to work and change nothing, so it is left
    // unavailable. If it is ever wired into model selection, this test should
    // be deleted along with the omission.
    setup();
    expect(screen.queryByText(/pinned model/i)).toBeNull();
    expect(screen.queryByRole('radio', { name: /pin/i })).toBeNull();
  });
});
