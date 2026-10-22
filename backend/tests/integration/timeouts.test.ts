import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { ChatEvent } from '@nexusai/contracts';
import { Client, createHarness, ulid, type Harness } from '../fixtures/harness.ts';

/**
 * Model timeouts with streaming calls.
 *
 * `MODEL_TIMEOUT_MS` is how long a model may go *silent* — before its first
 * token or between tokens. It is not a cap on how long an answer may take to
 * write: a long answer that is still arriving is not a stalled provider, and
 * cutting it off would discard the work the reader is watching. The hard
 * ceiling on one model call is `ORCHESTRATION_TIMEOUT_MS`.
 */
let harness: Harness;
let client: Client;

beforeAll(async () => {
  harness = await createHarness({ MODEL_TIMEOUT_MS: '200', ORCHESTRATION_TIMEOUT_MS: '1500' });
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

async function ask(text: string) {
  const res = await client.post('/api/chat/stream', {
    conversationId: null,
    message: 'A question with a long answer.',
    selection: { mode: 'manual', modelId: 'test-alpha' },
    clientMessageId: ulid(),
  });
  const events: ChatEvent[] = [];
  for (const block of String(res.body).split('\n\n')) {
    const line = block.split('\n').find((l) => l.startsWith('data: '));
    if (line) events.push(ChatEvent.parse(JSON.parse(line.slice(6))));
  }
  void text;
  return events;
}

describe('model timeouts while streaming', () => {
  it('lets an answer that keeps arriving run past the per-model timeout', async () => {
    // Ten chunks, 60ms apart: ~600ms in total, never 200ms of silence.
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: 'one two three four five six seven eight nine ten',
      chunkDelayMs: 60,
    });

    const events = await ask('long');
    const complete = events.find((e) => e.type === 'complete');
    expect(complete).toBeDefined();
    expect(events.find((e) => e.type === 'error')).toBeUndefined();

    const doc = await harness.db
      .collection('messages')
      .findOne({ _id: new ObjectId((complete as { messageId: string }).messageId) });
    expect(doc?.status).toBe('complete');
    expect(doc?.content).toBe('one two three four five six seven eight nine ten');
  });

  it('still times out a model that goes silent before its first token', async () => {
    harness.testAdapter.program('test-alpha', { kind: 'succeed', delayMs: 800 });

    const events = await ask('silent');
    const error = events.find((e) => e.type === 'error');
    expect(error).toBeDefined();
    const start = events.find((e) => e.type === 'start') as { messageId: string };
    const doc = await harness.db.collection('messages').findOne({ _id: new ObjectId(start.messageId) });
    expect(doc?.responses[0].errorCode).toBe('TIMEOUT');
  });

  it('still times out a model that stalls mid-answer, keeping what arrived', async () => {
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: 'first second third',
      chunkDelayMs: 600,
    });

    const events = await ask('stall');
    const shown = events
      .filter((e): e is Extract<ChatEvent, { type: 'delta' }> => e.type === 'delta')
      .map((e) => e.text)
      .join('');
    expect(shown).toBe('first ');
    const start = events.find((e) => e.type === 'start') as { messageId: string };
    const doc = await harness.db.collection('messages').findOne({ _id: new ObjectId(start.messageId) });
    expect(doc?.status).toBe('failed_partial');
    expect(doc?.responses[0].errorCode).toBe('TIMEOUT');
  });

  it('caps one model call at the orchestration ceiling even while it keeps streaming', async () => {
    // 150ms between chunks never trips the 200ms silence limit, but forty
    // chunks would take ~6s against a 1.5s ceiling.
    harness.testAdapter.program('test-alpha', {
      kind: 'succeed',
      text: Array.from({ length: 40 }, (_, i) => `w${i}`).join(' '),
      chunkDelayMs: 150,
    });

    const startedAt = Date.now();
    const events = await ask('endless');
    expect(Date.now() - startedAt).toBeLessThan(4000);
    const start = events.find((e) => e.type === 'start') as { messageId: string };
    const doc = await harness.db.collection('messages').findOne({ _id: new ObjectId(start.messageId) });
    expect(doc?.status).toBe('failed_partial');
    expect(doc?.responses[0].errorCode).toBe('TIMEOUT');
  });
});
