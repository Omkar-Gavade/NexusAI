import { ConversationListResponse, type RenameConversationRequest } from '@nexusai/contracts';
import { empty, json } from '@/lib/http';

import { collectPages } from '@/lib/paginate';

/** Newest first; each later page is older, so pages are appended. */
export async function listConversations(): Promise<ConversationListResponse> {
  const { items, nextCursor } = await collectPages(
    async (cursor) => {
      const query = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await json(`/conversations${query}`, ConversationListResponse);
      return { items: page.conversations, nextCursor: page.nextCursor };
    },
    { maxPages: 10, order: 'append' },
  );
  return { conversations: items, nextCursor };
}

export const renameConversation = (id: string, body: RenameConversationRequest) =>
  empty(`/conversations/${id}`, { method: 'PATCH', body });

export const deleteConversation = (id: string) =>
  empty(`/conversations/${id}`, { method: 'DELETE' });
