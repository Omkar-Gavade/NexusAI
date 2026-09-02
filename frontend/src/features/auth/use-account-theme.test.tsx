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
  useThemeStore.setState({ preference: 'system', resolved: 'dark' });
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

  it('applies locally with no session, so the marketing pages still work', () => {
    const { result } = setup(null);
    act(() => result.current.setTheme('light'));
    expect(useThemeStore.getState().preference).toBe('light');
    expect(vi.mocked(api.updateProfile)).not.toHaveBeenCalled();
  });
});
