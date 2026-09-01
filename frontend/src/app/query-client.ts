import { QueryClient } from '@tanstack/react-query';
import { isRetryable } from '@/lib/http';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // Never retry a 4xx: the request was wrong, and repeating it is noise.
        retry: (failureCount, error) => isRetryable(error) && failureCount < 2,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      // Mutations are not idempotent. A retried send is a second generation.
      mutations: { retry: false },
    },
  });
}
