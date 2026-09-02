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
 * sources of truth, one of them inert. Precedence is:
 *
 *     a theme chosen on this device → account preference → system
 *
 * The account used to win outright, and that discarded a decision the person
 * had just made in front of them. Someone who set light on the public page and
 * then signed in watched the workspace turn dark — and the adoption wrote
 * through to `localStorage`, so the public page was dark when they went back.
 * The two surfaces disagreed for exactly as long as it took to sign in, and
 * then agreed on the value nobody asked for.
 *
 * So a device that holds a real choice keeps it and pushes it up to the
 * account; a device that has never had one adopts what the account holds,
 * which is the cross-device case this exists for. `chosen`, not `preference`,
 * is what separates them: `system` is both the untouched default and something
 * a person can deliberately select.
 *
 * The local store stays the immediate layer: it applies instantly, it works
 * signed out (the public page has no session), and it is what avoids a flash
 * of the wrong theme on load. The account is reconciled once, when the session
 * first arrives — guarded by a ref, so a change made after that is never
 * overwritten by a late-arriving query.
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
  const chosen = useThemeStore((state) => state.chosen);
  const setPreference = useThemeStore((state) => state.setPreference);
  const reconciled = useRef(false);

  useEffect(() => {
    if (!user || reconciled.current) return;
    reconciled.current = true;

    if (user.preferences.theme === preference) return;

    if (chosen) {
      // This device's choice is the more recent decision, so the account
      // follows it rather than the other way round. Same fire-and-forget write
      // as `setTheme` below, for the same reason.
      updateProfile.mutate({ preferences: { theme: preference } });
      return;
    }

    // Nothing was ever chosen here, so the account is the only opinion there
    // is. This is the preference following someone to a second device.
    setPreference(user.preferences.theme);
  }, [user, preference, chosen, setPreference, updateProfile]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      if (user) updateProfile.mutate({ preferences: { theme: next } });
    },
    [setPreference, updateProfile, user],
  );

  return { preference, setTheme };
}
