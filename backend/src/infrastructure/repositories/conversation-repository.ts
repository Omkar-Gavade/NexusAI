import { ObjectId, type Collection, type Db } from 'mongodb';
import type { ConversationDoc } from './types.ts';

export class ConversationRepository {
  private readonly conversations: Collection<ConversationDoc>;

  constructor(db: Db) {
    this.conversations = db.collection<ConversationDoc>('conversations');
  }

  create(userId: string, title: string): Promise<ConversationDoc> {
    return this.createWithId(new ObjectId().toHexString(), userId, title);
  }

  /** The id is reserved by the caller so the message can be written first. */
  async createWithId(id: string, userId: string, title: string): Promise<ConversationDoc> {
    const now = new Date();
    const doc: ConversationDoc = {
      _id: new ObjectId(id),
      userId: new ObjectId(userId),
      title,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.conversations.insertOne(doc);
    return doc;
  }

  /**
   * Ownership is part of the filter, never a separate check.
   *
   * There is no `if (doc.userId !== userId)` anywhere in this layer: forgetting
   * a check is possible, forgetting a filter returns nothing. A row owned by
   * someone else is indistinguishable from a row that does not exist, which is
   * also why the API answers 404 rather than 403.
   */
  findOwned(userId: string, conversationId: string): Promise<ConversationDoc | null> {
    if (!ObjectId.isValid(conversationId)) return Promise.resolve(null);
    return this.conversations.findOne({
      _id: new ObjectId(conversationId),
      userId: new ObjectId(userId),
    });
  }

  /**
   * Cursor pagination on `updatedAt`, tie-broken by `_id` so the ordering is
   * total. Ordering by a non-unique field alone can drop or duplicate rows
   * across page boundaries.
   */
  async list(
    userId: string,
    options: { limit: number; cursor?: string | undefined },
  ): Promise<{ conversations: ConversationDoc[]; nextCursor: string | null }> {
    const filter: Record<string, unknown> = { userId: new ObjectId(userId) };

    if (options.cursor) {
      const anchor = await this.conversations.findOne(
        { _id: new ObjectId(options.cursor) },
        { projection: { updatedAt: 1 } },
      );
      if (anchor) {
        filter.$or = [
          { updatedAt: { $lt: anchor.updatedAt } },
          { updatedAt: anchor.updatedAt, _id: { $lt: new ObjectId(options.cursor) } },
        ];
      }
    }

    // One extra row tells us whether another page exists without a count().
    const rows = await this.conversations
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(options.limit + 1)
      .toArray();

    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;

    return {
      conversations: page,
      nextCursor: hasMore ? (page.at(-1)?._id.toHexString() ?? null) : null,
    };
  }

  async rename(userId: string, conversationId: string, title: string): Promise<boolean> {
    if (!ObjectId.isValid(conversationId)) return false;
    const { matchedCount } = await this.conversations.updateOne(
      { _id: new ObjectId(conversationId), userId: new ObjectId(userId) },
      { $set: { title, updatedAt: new Date() } },
    );
    return matchedCount > 0;
  }

  async delete(userId: string, conversationId: string): Promise<boolean> {
    if (!ObjectId.isValid(conversationId)) return false;
    const { deletedCount } = await this.conversations.deleteOne({
      _id: new ObjectId(conversationId),
      userId: new ObjectId(userId),
    });
    return deletedCount > 0;
  }

  /** Called after a turn completes, so the sidebar orders by real activity. */
  async touch(conversationId: string, messageDelta: number): Promise<void> {
    await this.conversations.updateOne(
      { _id: new ObjectId(conversationId) },
      { $set: { updatedAt: new Date() }, $inc: { messageCount: messageDelta } },
    );
  }
}
