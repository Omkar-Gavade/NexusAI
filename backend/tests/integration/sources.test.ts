import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import type { ChatEvent } from '@nexusai/contracts';
import { createHarness, type Harness } from '../fixtures/harness.ts';
import { Errors } from '../../src/domain/errors.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function turn(text: string) {
  h.testAdapter.reset();
  h.testAdapter.setDefault({ kind: 'succeed', text });
  return turnRaw();
}

/** Runs a turn against whatever the adapter is currently programmed to do. */
async function turnRaw() {
  const { user } = await h.container.auth.register({
    email: `src-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Sources',
  });

  const events: ChatEvent[] = [];
  for await (const event of h.container.orchestrator.run(
    {
      userId: user.id,
      conversationId: null,
      message: 'cite your sources',
      clientMessageId: `src-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      selection: { mode: 'auto', routing: 'balanced' },
      requestId: 'src-test',
    },
    new AbortController().signal,
  )) {
    events.push(event);
  }

  const start = events.find((e) => e.type === 'start') as { messageId: string };
  return { events, messageId: start.messageId };
}

/**
 * Sources are contractually a *retrieved document*: `url`, `domain`, `snippet`
 * and `retrievedAt`. Nothing in the current architecture retrieves anything —
 * the adapters send plain chat completions with no grounding or search tool —
 * so there is no honest way to populate that shape, and the event is emitted
 * empty rather than omitted so the client's state is explicit.
 *
 * The failure mode these guard is the tempting one: a model writes a URL in its
 * prose, and someone scrapes it into a source card. That would invent a
 * `snippet` and a `retrievedAt` for a document nobody fetched.
 */
describe('sources', () => {
  it('emits the event with an empty list rather than omitting it', async () => {
    const { events } = await turn('A plain answer.');
    const sources = events.find((e) => e.type === 'sources');

    expect(sources).toBeDefined();
    expect(sources).toMatchObject({ sources: [] });
  }, 30_000);

  it('does not manufacture sources from URLs a model wrote in its prose', async () => {
    const withUrls = [
      'According to https://example.com/study and https://arxiv.org/abs/1234.5678,',
      'the result holds. See also www.nature.com/articles/abc for confirmation [1][2].',
    ].join(' ');

    const { events, messageId } = await turn(withUrls);

    expect(events.find((e) => e.type === 'sources')).toMatchObject({ sources: [] });

    // And nothing was invented on the way to the database either.
    const doc = await h.db.collection('messages').findOne({ _id: new ObjectId(messageId) });
    expect(doc?.sources).toEqual([]);
  }, 30_000);

  it('does not treat inline citation markers as evidence of sources', async () => {
    // A model emitting "[1]" must never produce a source numbered 1: a marker
    // pointing at a source that does not exist is worse than no marker.
    const { events } = await turn('The answer is four [1]. This is well established [2][3].');
    expect(events.find((e) => e.type === 'sources')).toMatchObject({ sources: [] });
  }, 30_000);
});

/**
 * Usage is reported only where a provider measured it. The one thing that must
 * never happen is a number that looks measured but was computed by us.
 */
describe('usage reporting', () => {
  it('sums only what the providers reported, and covers the fan-out alone', async () => {
    const { messageId } = await turn('An answer.');
    const doc = await h.db.collection('messages').findOne({ _id: new ObjectId(messageId) });

    const responses = doc!.responses as Array<{ inputTokens: number | null }>;
    const perModel = responses.map((r) => r.inputTokens).filter((v): v is number => v !== null);
    const total = (doc!.metadata as { inputTokens: number | null }).inputTokens;

    // Documented semantics: the total is exactly the fan-out, with no synthesis
    // component and nothing estimated to fill the gap.
    expect(total).toBe(perModel.reduce((a, b) => a + b, 0));
  }, 30_000);

  it('leaves a failed model’s usage null rather than recording a confident zero', async () => {
    h.testAdapter.reset();
    h.testAdapter.program('test-beta', { kind: 'fail', error: Errors.providerError({}) });
    const { messageId } = await turnRaw();

    const doc = await h.db.collection('messages').findOne({ _id: new ObjectId(messageId) });
    const beta = (
      doc!.responses as Array<{
        model: { modelId: string };
        inputTokens: number | null;
        outputTokens: number | null;
      }>
    )
      .find((r) => r.model.modelId === 'test-beta')!;

    // Zero would read as "measured, and it was nothing".
    expect(beta.inputTokens).toBeNull();
    expect(beta.outputTokens).toBeNull();
  }, 30_000);
});
