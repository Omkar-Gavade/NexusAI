import { useCallback, useEffect, useRef } from 'react';
import type { ThemePreference } from '@nexusai/contracts';
import { useThemeStore } from '@/stores/theme-store';
import { useSession, useUpdateProfile } from './use-session';

/**
 * Makes the account the source of truth for theme, without making the theme
 * wait on the network.
 *
 * The server has always stored `preferences.theme` and nothing ever read it, so
 * a preference set on one device never followed the account to another — two
 * sources of truth, one of them inert. Precedence is now:
 *
 *     account preference → local preference → system
 *
 * The local store stays the immediate layer: it applies instantly, it works
 * signed out (the marketing pages have no session), and it is what avoids a
 * flash of the wrong theme on load. The account is adopted once, when the
 * session first arrives — guarded by a ref, so a change made after that is
 * never overwritten by a late-arriving query.
 *
 * The account write is deliberately not awaited and its failure is not
 * surfaced. Reverting a theme the user can see because a background PATCH
 * failed would be worse than the preference not following them to a second
 * device.
 */
export function useAccountTheme() {
  const { data: user } = useSession();
  const updateProfile = useUpdateProfile();
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const adopted = useRef(false);

  useEffect(() => {
    if (!user || adopted.current) return;
    adopted.current = true;
    if (user.preferences.theme !== preference) setPreference(user.preferences.theme);
  }, [user, preference, setPreference]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      if (user) updateProfile.mutate({ preferences: { theme: next } });
    },
    [setPreference, updateProfile, user],
  );

  return { preference, setTheme };
}
