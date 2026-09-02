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
    expect(screen.getByRole('radio', { name: /thorough/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /balanced/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
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
