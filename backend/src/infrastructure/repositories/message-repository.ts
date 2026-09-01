import { ObjectId, type Collection, type Db } from 'mongodb';
import type { MessageStatus } from '@nexusai/contracts';
import type { MessageDoc } from './types.ts';

export class MessageRepository {
  private readonly messages: Collection<MessageDoc>;

  constructor(db: Db) {
    this.messages = db.collection<MessageDoc>('messages');
  }

  async insert(doc: Omit<MessageDoc, '_id'>): Promise<MessageDoc> {
    const full: MessageDoc = { _id: new ObjectId(), ...doc };
    await this.messages.insertOne(full);
    return full;
  }

  /** Every query carries userId — ownership is the filter (see conversations). */
  async listForConversation(
    userId: string,
    conversationId: string,
    options: { limit: number; cursor?: string | undefined },
  ): Promise<{ messages: MessageDoc[]; nextCursor: string | null }> {
    if (!ObjectId.isValid(conversationId)) return { messages: [], nextCursor: null };

    const filter: Record<string, unknown> = {
      conversationId: new ObjectId(conversationId),
      userId: new ObjectId(userId),
    };

    // Paging walks backwards from the newest, so `cursor` is an upper bound.
    if (options.cursor && ObjectId.isValid(options.cursor)) {
      filter._id = { $lt: new ObjectId(options.cursor) };
    }

    const rows = await this.messages
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(options.limit + 1)
      .toArray();

    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;

    return {
      // Oldest-first within the page, so the client can prepend without sorting.
      messages: page.reverse(),
      nextCursor: hasMore ? (page[0]?._id.toHexString() ?? null) : null,
    };
  }

  /** Oldest-first, bounded — the context window for a new turn. */
  recentForContext(conversationId: string, limit: number): Promise<MessageDoc[]> {
    return this.messages
      .find({ conversationId: new ObjectId(conversationId), status: 'complete' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
      .then((rows) => rows.reverse());
  }

  findByClientMessageId(userId: string, clientMessageId: string): Promise<MessageDoc | null> {
    return this.messages.findOne({ userId: new ObjectId(userId), clientMessageId });
  }

  async finalise(
    messageId: ObjectId,
    patch: Partial<Pick<MessageDoc, 'content' | 'status' | 'responses' | 'agreement' | 'sources' | 'metadata' | 'synthesisModel'>>,
  ): Promise<void> {
    await this.messages.updateOne({ _id: messageId }, { $set: patch });
  }

  async deleteForConversation(conversationId: string): Promise<number> {
    const { deletedCount } = await this.messages.deleteMany({
      conversationId: new ObjectId(conversationId),
    });
    return deletedCount;
  }

  async deleteById(userId: string, messageId: string): Promise<boolean> {
    if (!ObjectId.isValid(messageId)) return false;
    const { deletedCount } = await this.messages.deleteOne({
      _id: new ObjectId(messageId),
      userId: new ObjectId(userId),
    });
    return deletedCount > 0;
  }

  /**
   * No message may be left non-terminal. A process killed mid-generation leaves
   * an assistant row that would otherwise read as permanently in flight.
   */
  async sweepIncomplete(status: MessageStatus = 'failed'): Promise<number> {
    const { modifiedCount } = await this.messages.updateMany(
      { role: 'assistant', status: { $nin: ['complete', 'cancelled', 'failed', 'failed_partial'] } },
      { $set: { status } },
    );
    return modifiedCount;
  }
}
