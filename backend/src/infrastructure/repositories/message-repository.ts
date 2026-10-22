import { ObjectId, type Collection, type Db } from 'mongodb';
import type { MessageStatus, Stance } from '@nexusai/contracts';
import type { MessageDoc } from './types.ts';

/** Aggregation form of "this model responded": complete, with non-blank text. */
const RESPONDED = {
  $and: [
    { $eq: ['$$r.outcome', 'complete'] },
    { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$$r.text', ''] } } } }, 0] },
  ],
};

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
   * Records a synthesis on an existing turn without rewriting its responses.
   *
   * Only the synthesis fields and each judged model's `stance` are written,
   * positionally. Rewriting the whole `responses` array from the snapshot read
   * before the (slow) synthesis call erased any model retried in the meantime.
   */
  async applySynthesis(
    messageId: ObjectId,
    input: {
      content: string;
      synthesisModel: NonNullable<MessageDoc['synthesisModel']>;
      stances: ReadonlyArray<{ modelId: string; stance: Stance }>;
    },
  ): Promise<MessageDoc | null> {
    const set: Record<string, unknown> = {
      content: input.content,
      synthesisModel: input.synthesisModel,
    };
    const arrayFilters = input.stances.map(({ modelId }, index) => ({
      [`s${index}.model.modelId`]: modelId,
    }));
    input.stances.forEach(({ stance }, index) => {
      set[`responses.$[s${index}].stance`] = stance;
    });
    await this.messages.updateOne({ _id: messageId }, { $set: set }, { arrayFilters });
    return this.recomputeAgreement(messageId);
  }

  /**
   * Records one model's retried response and the spend it added.
   *
   * Each step is its own atomic update computed inside the database, so
   * concurrent writers converge rather than one overwriting another.
   *
   * The response is replaced positionally (two models retried at once each
   * keep their own result), and the turn's usage totals accumulate inside the
   * database rather than from a value read earlier — read-modify-write there
   * lost the cost of whichever retry finished first.
   */
  async recordRetry(
    messageId: ObjectId,
    modelId: string,
    response: MessageDoc['responses'][number],
    spend: { inputTokens: number | null; outputTokens: number | null; estimatedCostUsd: number | null },
  ): Promise<MessageDoc | null> {
    const replaced = await this.messages.updateOne(
      { _id: messageId },
      { $set: { 'responses.$[target]': response } },
      { arrayFilters: [{ 'target.model.modelId': modelId }] },
    );
    if (replaced.matchedCount === 0) return null;

    // Null means "not reported": adding it would turn an unknown into a zero.
    const accumulate = (field: string, value: number | null, round = false) => {
      if (value === null) return `$metadata.${field}`;
      const total = { $add: [{ $ifNull: [`$metadata.${field}`, 0] }, value] };
      return round ? { $round: [total, 8] } : total;
    };
    await this.messages.updateOne({ _id: messageId, metadata: { $type: 'object' } }, [
      {
        $set: {
          'metadata.inputTokens': accumulate('inputTokens', spend.inputTokens),
          'metadata.outputTokens': accumulate('outputTokens', spend.outputTokens),
          'metadata.estimatedCostUsd': accumulate('estimatedCostUsd', spend.estimatedCostUsd, true),
        },
      },
    ]);

    // A turn with any usable answer is complete; otherwise it keeps its status.
    await this.messages.updateOne({ _id: messageId }, [
      {
        $set: {
          status: {
            $cond: [{ $gt: [{ $size: { $filter: { input: '$responses', as: 'r', cond: RESPONDED } } }, 0] }, 'complete', '$status'],
          },
        },
      },
    ]);
    return this.recomputeAgreement(messageId);
  }

  /**
   * Derives `agreement` from the responses stored *now*, in one atomic step.
   *
   * Every writer calls this after its own change, so the last one to run
   * always reflects the latest responses — concurrent writers converge instead
   * of the slower one overwriting the faster one's counts with a stale view.
   * Mirrors `computeAgreement`: responded = complete with non-blank text.
   */
  async recomputeAgreement(messageId: ObjectId): Promise<MessageDoc | null> {
    const count = (cond: unknown) => ({
      $size: { $filter: { input: '$responses', as: 'r', cond } },
    });
    return this.messages.findOneAndUpdate(
      { _id: messageId },
      [
        {
          $set: {
            agreement: {
              requested: { $size: '$responses' },
              responded: count(RESPONDED),
              concur: count({ $and: [RESPONDED, { $eq: ['$$r.stance', 'concurs'] }] }),
              diverge: count({ $and: [RESPONDED, { $eq: ['$$r.stance', 'diverges'] }] }),
            },
          },
        },
      ],
      { returnDocument: 'after' },
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
