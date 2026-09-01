import type { Conversation, Message } from '@nexusai/contracts';
import { Errors } from '../domain/errors.ts';
import type { ConversationRepository } from '../infrastructure/repositories/conversation-repository.ts';
import type { MessageRepository } from '../infrastructure/repositories/message-repository.ts';
import type { ConversationDoc, MessageDoc } from '../infrastructure/repositories/types.ts';

const MAX_PAGE = 100;
const DEFAULT_PAGE = 50;

export class ConversationService {
  constructor(
    private readonly deps: {
      conversations: ConversationRepository;
      messages: MessageRepository;
    },
  ) {}

  async list(userId: string, options: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clamp(options.limit ?? DEFAULT_PAGE);
    const page = await this.deps.conversations.list(userId, {
      limit,
      cursor: options.cursor,
    });
    return {
      conversations: page.conversations.map(toWireConversation),
      nextCursor: page.nextCursor,
    };
  }

  async rename(userId: string, conversationId: string, title: string): Promise<void> {
    const ok = await this.deps.conversations.rename(userId, conversationId, title);
    // A row owned by someone else is indistinguishable from one that does not
    // exist, which is why this is 404 and never 403.
    if (!ok) throw Errors.notFound();
  }

  async delete(userId: string, conversationId: string): Promise<void> {
    const owned = await this.deps.conversations.findOwned(userId, conversationId);
    if (!owned) throw Errors.notFound();

    // Messages first: an orphaned message is worse than an orphaned
    // conversation, because nothing would ever list it again to clean it up.
    await this.deps.messages.deleteForConversation(conversationId);
    await this.deps.conversations.delete(userId, conversationId);
  }

  async messages(
    userId: string,
    conversationId: string,
    options: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const owned = await this.deps.conversations.findOwned(userId, conversationId);
    if (!owned) throw Errors.notFound();

    const page = await this.deps.messages.listForConversation(userId, conversationId, {
      limit: clamp(options.limit ?? DEFAULT_PAGE),
      cursor: options.cursor,
    });

    return { messages: page.messages.map(toWireMessage), nextCursor: page.nextCursor };
  }
}

function clamp(limit: number): number {
  return Math.min(Math.max(limit, 1), MAX_PAGE);
}

function toWireConversation(doc: ConversationDoc): Conversation {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    projectId: null,
    messageCount: doc.messageCount,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toWireMessage(doc: MessageDoc): Message {
  return {
    id: doc._id.toHexString(),
    role: doc.role,
    content: doc.content,
    status: doc.status,
    synthesisModel: doc.synthesisModel,
    responses: doc.responses.map((r) => ({
      model: r.model,
      text: r.text,
      outcome: r.outcome,
      stance: r.stance,
      latencyMs: r.latencyMs,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      errorCode: r.errorCode as Message['responses'][number]['errorCode'],
    })),
    agreement: doc.agreement,
    sources: doc.sources,
    metadata: doc.metadata,
    createdAt: doc.createdAt.toISOString(),
  };
}
