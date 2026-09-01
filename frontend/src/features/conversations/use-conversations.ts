import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationListResponse } from '@nexusai/contracts';
import * as api from './api';

export const conversationsKey = ['conversations'] as const;

export function useConversations() {
  return useQuery({ queryKey: conversationsKey, queryFn: api.listConversations });
}

export function useRenameConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.renameConversation(id, { title }),

    // Optimistic, with the snapshot captured before the write so onError can
    // put the previous title back exactly.
    onMutate: async ({ id, title }) => {
      await client.cancelQueries({ queryKey: conversationsKey });
      const previous = client.getQueryData<ConversationListResponse>(conversationsKey);
      if (previous) {
        client.setQueryData<ConversationListResponse>(conversationsKey, {
          ...previous,
          conversations: previous.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        });
      }
      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(conversationsKey, context.previous);
    },

    onSettled: () => client.invalidateQueries({ queryKey: conversationsKey }),
  });
}

export function useDeleteConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteConversation,

    onMutate: async (id: string) => {
      await client.cancelQueries({ queryKey: conversationsKey });
      const previous = client.getQueryData<ConversationListResponse>(conversationsKey);
      if (previous) {
        client.setQueryData<ConversationListResponse>(conversationsKey, {
          ...previous,
          conversations: previous.conversations.filter((c) => c.id !== id),
        });
      }
      return { previous };
    },

    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(conversationsKey, context.previous);
    },

    onSettled: () => client.invalidateQueries({ queryKey: conversationsKey }),
  });
}
