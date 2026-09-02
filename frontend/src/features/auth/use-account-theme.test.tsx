import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/render';
import { useThemeStore } from '@/stores/theme-store';
import { sessionKey } from './use-session';
import { useAccountTheme } from './use-account-theme';

vi.mock('./api', () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
}));
const api = await import('./api');

const session = (theme: 'dark' | 'light' | 'system') => ({
  user: {
    id: 'u',
    email: 'a@b.co',
    displayName: 'Ada',
    preferences: { theme, routingMode: 'balanced' as const, pinnedModelId: null },
    createdAt: new Date().toISOString(),
  },
});

function setup(theme: 'dark' | 'light' | 'system' | null) {
  const client = createTestQueryClient();
  if (theme) client.setQueryData(sessionKey, session(theme));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useAccountTheme(), { wrapper });
}

beforeEach(() => {
  vi.mocked(api.updateProfile).mockReset();
  localStorage.clear();
  // `chosen: false` is the untouched device — no theme has ever been picked
  // here, which is the state every existing case below assumes.
  useThemeStore.setState({ preference: 'system', resolved: 'dark', chosen: false });
});

describe('theme precedence', () => {
  it('adopts the account preference when the session arrives', async () => {
    setup('light');
    await waitFor(() => expect(useThemeStore.getState().preference).toBe('light'));
  });

  it('leaves the local preference alone when the account already agrees', async () => {
    useThemeStore.setState({ preference: 'dark', resolved: 'dark' });
    setup('dark');
    await waitFor(() => expect(useThemeStore.getState().preference).toBe('dark'));
    // Adoption is a no-op here, so nothing is written back to the account.
    expect(vi.mocked(api.updateProfile)).not.toHaveBeenCalled();
  });

  it('does not adopt again after the user changes it', async () => {
    const { result } = setup('light');
    await waitFor(() => expect(useThemeStore.getState().preference).toBe('light'));

    act(() => result.current.setTheme('dark'));
    // A re-render with the same session must not drag it back to `light`.
    await waitFor(() => expect(useThemeStore.getState().preference).toBe('dark'));
  });

  it('writes a change through to the account', async () => {
    vi.mocked(api.updateProfile).mockResolvedValue(session('dark'));
    const { result } = setup('light');
    await waitFor(() => expect(useThemeStore.getState().preference).toBe('light'));

    act(() => result.current.setTheme('dark'));

    await waitFor(() => {
      expect(vi.mocked(api.updateProfile).mock.calls[0]?.[0]).toEqual({
        preferences: { theme: 'dark' },
      });
    });
  });

  /*
   * The reported bug, as a test.
   *
   * A visitor picks light on the public page, signs in, and the workspace
   * turned dark — the account's value overwrote the decision they had just
   * made, and wrote through to `localStorage`, so the public page was dark
   * when they went back. The two surfaces disagreed until the sign-in landed
   * and then agreed on the value nobody asked for.
   */
  it('keeps a theme chosen on this device when the account disagrees', async () => {
    vi.mocked(api.updateProfile).mockResolvedValue(session('light'));
    // Chosen on the public page, signed out.
    act(() => useThemeStore.getState().setPreference('light'));
    expect(useThemeStore.getState().chosen).toBe(true);

    // Then the session arrives, holding something else.
    setup('dark');

    await waitFor(() => {
      expect(vi.mocked(api.updateProfile).mock.calls[0]?.[0]).toEqual({
        preferences: { theme: 'light' },
      });
    });
    // The surface the user is looking at never changed under them.
    expect(useThemeStore.getState().preference).toBe('light');
  });

  /*
   * The other direction, which is what the account preference is for: a device
   * that has never had a theme picked on it takes the account's.
   */
  it('still adopts the account on a device that has never chosen', async () => {
    setup('light');
    await waitFor(() => expect(useThemeStore.getState().preference).toBe('light'));
    expect(vi.mocked(api.updateProfile)).not.toHaveBeenCalled();
  });

  /*
   * `system` is both the untouched default and something a person can pick in
   * Settings. Choosing it deliberately has to survive a session arriving, or
   * the choice is silently undone for the one value that looks like a default.
   */
  it('treats a deliberate `system` choice as a choice', async () => {
    vi.mocked(api.updateProfile).mockResolvedValue(session('system'));
    act(() => useThemeStore.getState().setPreference('system'));

    setup('dark');

    await waitFor(() => {
      expect(vi.mocked(api.updateProfile).mock.calls[0]?.[0]).toEqual({
        preferences: { theme: 'system' },
      });
    });
    expect(useThemeStore.getState().preference).toBe('system');
  });

  it('applies locally with no session, so the public page still works', () => {
    const { result } = setup(null);
    act(() => result.current.setTheme('light'));
    expect(useThemeStore.getState().preference).toBe('light');
    expect(vi.mocked(api.updateProfile)).not.toHaveBeenCalled();
  });
});
