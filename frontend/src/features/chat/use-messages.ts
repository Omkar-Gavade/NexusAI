import { skipToken, useQuery } from '@tanstack/react-query';
import { fetchMessages } from './api';

export const messagesKey = (conversationId: string) => ['messages', conversationId] as const;

/**
 * History for one conversation. Disabled on /c/new, where no conversation
 * record exists yet — a query for a conversation that has not been created is
 * a guaranteed 404, not a loading state.
 */
export function useMessages(conversationId: string | null) {
  const id = conversationId;
  return useQuery({
    queryKey: messagesKey(id ?? 'new'),
    // `enabled` already guarantees an id, but narrowing here keeps that
    // guarantee in the type system rather than in a comment.
    queryFn: id === null ? skipToken : () => fetchMessages(id),
    enabled: id !== null,
    staleTime: 30_000,
  });
}
