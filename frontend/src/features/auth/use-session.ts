import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/http';
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

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    // Cached conversations and messages belong to the user who just left.
    onSettled: () => client.clear(),
  });
}

/** Field-scoped message for a failed submit, or undefined. */
export function fieldError(error: unknown, path: string): string | undefined {
  return isApiError(error) ? error.fieldError(path) : undefined;
}
