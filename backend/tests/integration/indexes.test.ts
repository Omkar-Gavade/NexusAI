import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { ensureIndexes } from '../../src/infrastructure/database/indexes.ts';

const URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB = `nexusai_idx_${Date.now()}`;

let client: MongoClient;
let db: Db;
const conversationId = new ObjectId();
const userId = new ObjectId();

beforeAll(async () => {
  client = new MongoClient(URI);
  await client.connect();
  db = client.db(DB);
  await ensureIndexes(db);

  // Enough history that a query plan's cost is visible rather than theoretical.
  await db.collection('messages').insertMany(
    Array.from({ length: 2_000 }, (_, i) => ({
      conversationId,
      userId,
      role: i % 2 ? 'assistant' : 'user',
      content: `message ${i}`,
      status: 'complete',
      clientMessageId: i % 2 ? null : `C${String(i).padStart(25, '0')}`,
      responses: [],
      agreement: null,
      sources: [],
      metadata: null,
      createdAt: new Date(Date.now() - (2_000 - i) * 1_000),
    })),
  );
}, 60_000);

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

/** Every stage name in the winning plan, outermost first. */
function stages(plan: Record<string, unknown>): string[] {
  const names: string[] = [];
  (function walk(stage: Record<string, unknown> | undefined) {
    if (!stage) return;
    names.push(stage.stage as string);
    walk(stage.inputStage as Record<string, unknown> | undefined);
    for (const inner of (stage.inputStages ?? []) as Record<string, unknown>[]) walk(inner);
  })((plan.executionStats as { executionStages: Record<string, unknown> }).executionStages);
  return names;
}

async function explain(cursor: { explain: (v: string) => Promise<Record<string, unknown>> }) {
  const plan = await cursor.explain('executionStats');
  const stats = plan.executionStats as {
    totalKeysExamined: number;
    totalDocsExamined: number;
    nReturned: number;
  };
  return { stages: stages(plan), ...stats };
}

/**
 * Index coverage asserted against real query plans rather than by reading the
 * index definitions, because the two can disagree silently.
 *
 * The defect this guards: `{ conversationId: 1, createdAt: 1 }` satisfied the
 * filter but not the `{ createdAt: -1, _id: -1 }` sort, so MongoDB added a
 * blocking in-memory sort. Returning one 30-message page of a 4,000-message
 * conversation examined and fetched all 4,000 documents.
 */
describe('message history index', () => {
  it('serves the first page from the index, without a blocking sort', async () => {
    const plan = await explain(
      db
        .collection('messages')
        .find({ conversationId, userId })
        .sort({ createdAt: -1, _id: -1 })
        .limit(31),
    );

    expect(plan.stages).not.toContain('SORT');
    expect(plan.stages).toContain('IXSCAN');
    // The page size, not the conversation size.
    expect(plan.totalDocsExamined).toBeLessThanOrEqual(31);
  }, 30_000);

  it('does not fetch the whole conversation to serve a deep page', async () => {
    const cursor = (
      await db.collection('messages').find({}).sort({ _id: 1 }).skip(1_000).limit(1).toArray()
    )[0]!._id;

    const plan = await explain(
      db
        .collection('messages')
        .find({ conversationId, userId, _id: { $lt: cursor } })
        .sort({ createdAt: -1, _id: -1 })
        .limit(31),
    );

    expect(plan.stages).not.toContain('SORT');
    // Index entries are skipped cheaply; documents are what cost. Only the
    // page itself is fetched.
    expect(plan.totalDocsExamined).toBeLessThanOrEqual(31);
  }, 30_000);

  it('serves context assembly from the same index', async () => {
    const plan = await explain(
      db
        .collection('messages')
        .find({ conversationId, status: 'complete' })
        .sort({ createdAt: -1 })
        .limit(20),
    );

    expect(plan.stages).not.toContain('COLLSCAN');
    expect(plan.stages).not.toContain('SORT');
  }, 30_000);

  it('serves the idempotency probe from its unique index', async () => {
    const plan = await explain(
      db.collection('messages').find({ userId, clientMessageId: `C${'0'.repeat(24)}0` }),
    );
    expect(plan.stages).not.toContain('COLLSCAN');
  }, 30_000);

  it('is idempotent, including the replacement of a superseded index', async () => {
    await ensureIndexes(db);
    await ensureIndexes(db);

    const names = (await db.collection('messages').indexes()).map((i) => i.name);
    expect(names).toContain('conversationId_createdAt_id');
    // The superseded index is gone rather than left as a duplicate write cost.
    expect(names).not.toContain('conversationId_createdAt');
  }, 30_000);
});
