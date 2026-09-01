import { z } from 'zod';

export const Project = z.object({
  id: z.string(),
  name: z.string(),
  conversationCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof Project>;

export const Conversation = z.object({
  id: z.string(),
  title: z.string(),
  projectId: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof Conversation>;

export const ConversationListResponse = z.object({
  conversations: z.array(Conversation),
  nextCursor: z.string().nullable(),
});
export type ConversationListResponse = z.infer<typeof ConversationListResponse>;

export const ProjectListResponse = z.object({ projects: z.array(Project) });
export type ProjectListResponse = z.infer<typeof ProjectListResponse>;

export const RenameConversationRequest = z.object({
  title: z.string().trim().min(1).max(120),
});
export type RenameConversationRequest = z.infer<typeof RenameConversationRequest>;
