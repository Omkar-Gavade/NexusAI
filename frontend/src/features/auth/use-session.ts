import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { isApiError } from '@/lib/http';
import { routes } from '@/lib/routes';
import * as api from './api';

export const sessionKey = ['session'] as const;

/**
 * The session is server state, not client state. Keeping a parallel copy in a
 * store creates two sources of truth about who you are, which is how a UI ends
 * up showing a signed-in shell to a signed-out user.
 */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: api.me,
    retry: false,
    staleTime: 5 * 60_000,
    select: (data) => data.user,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.login,
    onSuccess: (data) => client.setQueryData(sessionKey, data),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.register,
    onSuccess: (data) => client.setQueryData(sessionKey, data),
  });
}

/**
 * Writes a preference back to the account.
 *
 * `PATCH /api/auth/me` has been implemented and tested on the server since the
 * beginning and had no caller, which is why `routingMode` could only ever hold
 * the value assigned at registration. The response is the updated session, so
 * it replaces the cache directly rather than triggering a refetch.
 */
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.updateProfile,
    onSuccess: (data) => client.setQueryData(sessionKey, data),
    // A failed save is surfaced by the settings dialog through `isError`, and
    // the cached session is left holding the value the server still has. The
    // handler is declared so the rejection is explicitly owned rather than
    // relying on it being swallowed.
    onError: () => undefined,
  });
}

/**
 * Changing the password.
 *
 * The server revokes every other refresh family and re-issues this caller's
 * session, so nothing here needs to sign the user out or refetch identity —
 * the cookies on the response are already the new ones.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: api.changePassword,
    onError: () => undefined,
  });
}

export function useLogout() {
  const client = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      /*
       * Home, and the navigation happens here rather than at the three call
       * sites so none of them can forget it.
       *
       * Order matters. Clearing the cache drops the session query, which
       * re-renders `RequireAuth` with no user — and it would send the person
       * to `/login?next=/app/chat/<the conversation they just signed out of>`
       * before this ran. Signing out landed on a sign-in form pre-aimed back
       * at the session that was just ended.
       *
       * `replace` so Back does not return into a workspace there is no longer
       * a session for.
       */
      navigate(routes.home, { replace: true });

      // Cached conversations and messages belong to the user who just left.
      client.clear();
    },
  });
}

/** Field-scoped message for a failed submit, or undefined. */
export function fieldError(error: unknown, path: string): string | undefined {
  return isApiError(error) ? error.fieldError(path) : undefined;
}
