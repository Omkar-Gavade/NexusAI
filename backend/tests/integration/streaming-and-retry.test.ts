import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { ChatEvent, type Message } from '@nexusai/contracts';
import { Client, createHarness, ulid, type Harness } from '../fixtures/harness.ts';
import { Errors } from '../../src/domain/errors.ts';

/**
 * Regression coverage for the audit fixes:
 *
 * - every model call streams, so TTFT is measured and the Arena / a single
 *   model show text as it is written (previously one lump at the end);
 * - a direct answer that breaks off keeps what the reader already saw;
 * - re-running one model on an earlier turn keeps the conversation context;
 * - two concurrent retries on the same turn do not erase each other;
 * - Arena selections outside 2–4 distinct models are rejected, not trimmed.
 */
let harness: Harness;
let client: Client;

beforeAll(async () => {
  harness = await createHarness();
  client = new Client(harness.app);
  await client.signUp();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(() => {
  harness.container.limiter.reset();
  harness.testAdapter.reset();
  harness.container.registry.health.reset();
});

function events(raw: string): ChatEvent[] {
  const out: ChatEvent[] = [];
  for (const block of raw.split('\n\n')) {
    const line = block.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    const parsed = ChatEvent.safeParse(JSON.parse(line.slice(6)));
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function ofType<T extends ChatEvent['type']>(list: ChatEvent[], type: T) {
  return list.filter((e): e is Extract<ChatEvent, { type: T }> => e.type === type);
}

async function ask(body: Record<string, unknown>) {
  const res = await client.post('/api/chat/stream', {
    conversationId: null,
    clientMessageId: ulid(),
    ...body,
  });
  return { res, events: events(String(res.body)) };
}

describe('incremental streaming', () => {
  it('streams each Arena panel in chunks and measures every model’s first token', async () => {
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: 'Alpha writes this answer in several words.',
    });
    harness.testAdapter.program('test-beta', {
      kind: 'succeed',
      text: 'Beta has a different answer entirely.',
    });

    const { events: list } = await ask({
      message: 'Compare two answers.',
      selection: { mode: 'compare', modelIds: ['test-alpha', 'test-beta'] },
    });

    for (const [id, text] of [
      ['test-alpha', 'Alpha writes this answer in several words.'],
      ['test-beta', 'Beta has a different answer entirely.'],
    ] as const) {
      const chunks = ofType(list, 'arena_delta').filter((e) => e.modelId === id);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.map((c) => c.text).join('')).toBe(text);

      const done = ofType(list, 'model_complete').find((e) => e.modelId === id)!;
      expect(done.text).toBe(text);
      expect(done.firstTokenMs).not.toBeNull();
      expect(done.firstTokenMs!).toBeLessThanOrEqual(done.latencyMs);
    }

    // Turn-level TTFT is the first chunk the reader saw, not a completion time.
    const complete = ofType(list, 'complete')[0]!;
    expect(complete.firstTokenMs).not.toBeNull();
    expect(complete.firstTokenMs!).toBeLessThanOrEqual(complete.latencyMs);
  });

  it('streams a single chosen model as the answer, exactly once, before it completes', async () => {
    const answer = 'One model answers this directly, word by word.';
    harness.testAdapter.program('test-alpha', { kind: 'succeed', text: answer });

    const { events: list } = await ask({
      message: 'A direct question.',
      selection: { mode: 'manual', modelId: 'test-alpha' },
    });

    const deltas = ofType(list, 'delta');
    expect(deltas.length).toBeGreaterThan(1);
    // Not re-sent in full after streaming: the answer appears exactly once.
    expect(deltas.map((d) => d.text).join('')).toBe(answer);

    const firstDelta = list.findIndex((e) => e.type === 'delta');
    const modelDone = list.findIndex((e) => e.type === 'model_complete');
    expect(firstDelta).toBeLessThan(modelDone);

    const complete = ofType(list, 'complete')[0]!;
    const persisted = await harness.db
      .collection('messages')
      .findOne({ _id: new ObjectId(complete.messageId) });
    expect(persisted?.content).toBe(answer);
    expect(persisted?.metadata?.firstTokenMs).toBe(complete.firstTokenMs);
    expect(persisted?.responses[0].firstTokenMs).not.toBeNull();
  });

  it('keeps the text already shown when a single model breaks off mid-answer', async () => {
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: 'The first three words then the provider drops.',
      failAfterChunks: 3,
    });

    const { events: list } = await ask({
      message: 'This answer will be cut off.',
      selection: { mode: 'manual', modelId: 'test-alpha' },
    });

    const shown = ofType(list, 'delta')
      .map((d) => d.text)
      .join('');
    expect(shown).toBe('The first three ');

    const error = ofType(list, 'error')[0]!;
    expect(error.partial).toBe(true);

    const start = ofType(list, 'start')[0]!;
    const persisted = await harness.db
      .collection('messages')
      .findOne({ _id: new ObjectId(start.messageId) });
    expect(persisted?.status).toBe('failed_partial');
    expect(persisted?.content).toBe(shown);
  });
});

describe('retrying one model', () => {
  async function arenaTurn(conversationId: string | null, message: string) {
    const res = await client.post('/api/chat/stream', {
      conversationId,
      message,
      selection: { mode: 'compare', modelIds: ['test-alpha', 'test-beta', 'test-gamma'] },
      clientMessageId: ulid(),
    });
    const list = events(String(res.body));
    return {
      conversationId: ofType(list, 'start')[0]!.conversationId,
      messageId: ofType(list, 'complete')[0]!.messageId,
    };
  }

  it('re-runs the model with the conversation as it stood at that turn', async () => {
    harness.testAdapter.program('test-alpha', { kind: 'succeed', text: 'First turn answer.' });
    const first = await arenaTurn(null, 'Name two consensus protocols.');
    await client.patch(
      `/api/conversations/${first.conversationId}/messages/${first.messageId}/selection`,
      { selectedModelId: 'test-alpha' },
    );

    harness.testAdapter.program('test-beta', {
      kind: 'fail',
      error: Errors.timeout({ modelId: 'test-beta' }),
    });
    const second = await arenaTurn(first.conversationId, 'Which of the two is simpler?');

    harness.testAdapter.reset();
    harness.testAdapter.program('test-beta', { kind: 'succeed', text: 'Raft is simpler.' });
    const res = await client.post(
      `/api/conversations/${second.conversationId}/messages/${second.messageId}/retry-model`,
      { modelId: 'test-beta' },
    );
    expect(res.status).toBe(200);

    const sent = harness.testAdapter.requests.at(-1)!.messages;
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'Which of the two is simpler?' });
    // The earlier exchange, with the answer the user chose, precedes it.
    expect(sent).toContainEqual({ role: 'user', content: 'Name two consensus protocols.' });
    expect(sent).toContainEqual({ role: 'assistant', content: 'First turn answer.' });
    // Nothing from after the retried turn leaks in.
    expect(sent.filter((m) => m.content === 'Which of the two is simpler?')).toHaveLength(1);
  });

  it('keeps both results when two models on the same turn are retried at once', async () => {
    for (const id of ['test-beta', 'test-gamma']) {
      harness.testAdapter.program(id, { kind: 'fail', error: Errors.timeout({ modelId: id }) });
    }
    const turn = await arenaTurn(null, 'Two of three models time out.');

    harness.testAdapter.reset();
    harness.testAdapter.program('test-beta', { kind: 'succeed', text: 'Beta retried.', delayMs: 60 });
    harness.testAdapter.program('test-gamma', { kind: 'succeed', text: 'Gamma retried.', delayMs: 20 });

    const url = `/api/conversations/${turn.conversationId}/messages/${turn.messageId}/retry-model`;
    const [a, b] = await Promise.all([
      client.post(url, { modelId: 'test-beta' }),
      client.post(url, { modelId: 'test-gamma' }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);

    const list = await client.get(`/api/conversations/${turn.conversationId}/messages`);
    const message = (list.body.messages as Message[]).find((m) => m.id === turn.messageId)!;
    const byId = Object.fromEntries(message.responses.map((r) => [r.model.modelId, r]));
    expect(byId['test-beta']).toMatchObject({ outcome: 'complete', text: 'Beta retried.' });
    expect(byId['test-gamma']).toMatchObject({ outcome: 'complete', text: 'Gamma retried.' });
  });
});

describe('Arena selection bounds', () => {
  it.each([
    ['one model', ['test-alpha']],
    ['five models', ['test-alpha', 'test-beta', 'test-gamma', 'test-delta', 'test-epsilon']],
    ['a duplicate', ['test-alpha', 'test-alpha', 'test-beta']],
  ])('rejects %s with a 400 instead of running a different set', async (_label, modelIds) => {
    const { res } = await ask({ message: 'Out of bounds.', selection: { mode: 'compare', modelIds } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(harness.testAdapter.calls).toHaveLength(0);
  });

  it('runs a full four-model Arena', async () => {
    const ids = ['test-alpha', 'test-beta', 'test-gamma', 'test-delta'];
    const { events: list } = await ask({
      message: 'Four at once.',
      selection: { mode: 'compare', modelIds: ids },
    });
    expect(ofType(list, 'start')[0]!.plan.map((m) => m.modelId)).toEqual(ids);
    expect(ofType(list, 'model_complete').map((e) => e.modelId).sort()).toEqual([...ids].sort());
  });
});
