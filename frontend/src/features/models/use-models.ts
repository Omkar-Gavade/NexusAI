import { useQuery } from '@tanstack/react-query';
import { fetchModels } from './api';

/**
 * Availability is time-sensitive, so this refetches on window focus: a user
 * returning to the tab after an hour must not see a stale AVAILABLE state. The
 * honesty rule expressed as a cache policy.
 */
export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
