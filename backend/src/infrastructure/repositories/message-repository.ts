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

  /**
   * Oldest-first, bounded — the context window for a turn.
   *
   * `beforeId` bounds it to what preceded a given message, so re-running one
   * model on an earlier turn sees the conversation as it stood then. The `_id`
   * tie-break matters: a user message and its answer can share a millisecond.
   */
  recentForContext(
    conversationId: string,
    limit: number,
    beforeId?: ObjectId,
  ): Promise<MessageDoc[]> {
    return this.messages
      .find({
        conversationId: new ObjectId(conversationId),
        status: 'complete',
        ...(beforeId ? { _id: { $lt: beforeId } } : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray()
      .then((rows) => rows.reverse());
  }

  findByClientMessageId(userId: string, clientMessageId: string): Promise<MessageDoc | null> {
    return this.messages.findOne({ userId: new ObjectId(userId), clientMessageId });
  }

  async findByIdOwned(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<MessageDoc | null> {
    if (!ObjectId.isValid(conversationId) || !ObjectId.isValid(messageId)) return null;
    return this.messages.findOne({
      _id: new ObjectId(messageId),
      conversationId: new ObjectId(conversationId),
      userId: new ObjectId(userId),
    });
  }

  async findPrecedingUserMessage(
    conversationId: string,
    assistantId: ObjectId,
    beforeDate: Date,
  ): Promise<MessageDoc | null> {
    if (!ObjectId.isValid(conversationId)) return null;
    return this.messages.findOne(
      {
        conversationId: new ObjectId(conversationId),
        role: 'user',
        createdAt: { $lte: beforeDate },
        _id: { $lt: assistantId },
      },
      { sort: { createdAt: -1, _id: -1 } },
    );
  }

  async finalise(
    messageId: ObjectId,
    patch: Partial<
      Pick<
        MessageDoc,
        | 'content'
        | 'status'
        | 'mode'
        | 'selectedModelId'
        | 'routingDecision'
        | 'responses'
        | 'agreement'
        | 'sources'
        | 'metadata'
        | 'synthesisModel'
      >
    >,
  ): Promise<void> {
    await this.messages.updateOne({ _id: messageId }, { $set: patch });
  }

  /**
   * Replaces one model's response in place.
   *
   * A positional update rather than rewriting the array: two models retried at
   * once on the same turn each read the old array, and whichever wrote last
   * erased the other's new answer.
   */
  async replaceResponse(
    messageId: ObjectId,
    modelId: string,
    response: MessageDoc['responses'][number],
  ): Promise<MessageDoc | null> {
    return this.messages.findOneAndUpdate(
      { _id: messageId },
      { $set: { 'responses.$[target]': response } },
      { arrayFilters: [{ 'target.model.modelId': modelId }], returnDocument: 'after' },
    );
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
