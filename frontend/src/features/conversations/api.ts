import { ConversationListResponse, type RenameConversationRequest } from '@nexusai/contracts';
import { empty, json } from '@/lib/http';

export const listConversations = () => json('/conversations', ConversationListResponse);

export const renameConversation = (id: string, body: RenameConversationRequest) =>
  empty(`/conversations/${id}`, { method: 'PATCH', body });

export const deleteConversation = (id: string) =>
  empty(`/conversations/${id}`, { method: 'DELETE' });
