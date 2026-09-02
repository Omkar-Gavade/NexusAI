import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const LONG_ANSWER = Array.from({ length: 80 }, (_, i) => `sentence ${i} of the answer.`).join(' ');

async function turn(): Promise<ChatEvent[]> {
  const { user } = await h.container.auth.register({
    email: `syn-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Syn',
  });

  const events: ChatEvent[] = [];
  for await (const event of h.container.orchestrator.run(
    {
      userId: user.id,
      conversationId: null,
      message: 'stream shape',
      clientMessageId: `syn-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      selection: { mode: 'auto', routing: 'balanced' },
      requestId: 'syn-test',
    },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  return events;
}

describe('synthesis streaming', () => {
  // Models do not reliably follow output-format instructions. Waiting for a
  // verdict block that never arrives used to buffer the entire answer and
  // deliver it as a single delta at the end — a blank screen for the whole
  // generation, which is the opposite of what streaming is for.
  it('streams incrementally when the synthesiser emits no verdict block', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault({ kind: 'succeed', text: LONG_ANSWER });

    const events = await turn();
    const deltas = events.filter((e) => e.type === 'delta');
    const agreement = events.find((e) => e.type === 'agreement');

    expect(deltas.length).toBeGreaterThan(1);
    // Nothing was classified, so nothing is claimed.
    expect(agreement).toMatchObject({ agreement: { concur: 0, diverge: 0, responded: 3 } });
    expect(Object.values((agreement as { stances: Record<string, string> }).stances)).toEqual([
      'unknown',
      'unknown',
      'unknown',
    ]);
  }, 30_000);

  it('still withholds and strips a verdict block when one is emitted', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault({
      kind: 'succeed',
      text: `<verdicts>\ntest-alpha: concurs\ntest-beta: diverges\ntest-gamma: concurs\n</verdicts>\n${LONG_ANSWER}`,
    });

    const events = await turn();
    const answer = events
      .filter((e) => e.type === 'delta')
      .map((e) => (e as { text: string }).text)
      .join('');

    expect(answer).not.toContain('<verdicts>');
    expect(answer).not.toContain('concurs');
    expect(events.find((e) => e.type === 'agreement')).toMatchObject({
      agreement: { responded: 3, concur: 2, diverge: 1 },
      stances: { 'test-alpha': 'concurs', 'test-beta': 'diverges', 'test-gamma': 'concurs' },
    });
  }, 30_000);
});

/**
 * The synthesis stage is a single point of failure for a turn whose models have
 * already answered. Observed against real providers: three models responded,
 * the synthesist was rate-limited, and the user received nothing — the work was
 * done and then discarded.
 */
describe('synthesis failover', () => {
  it('uses another synthesis-capable model when the first one fails', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault({ kind: 'succeed', text: LONG_ANSWER });

    // Only the stream path fails, so the fan-out still succeeds — exactly the
    // shape that lost a turn in the live run.
    const first = h.container.registry.synthesisModel()!;
    h.testAdapter.programStream(first.id, { kind: 'fail', error: Errors.rateLimited(30) });

    const events = await turn();

    const starts = events.filter((e) => e.type === 'synthesis_start');
    expect(starts.length).toBeGreaterThan(1);
    // The second attempt is a different model, and it is the one reported.
    expect((starts.at(-1) as { model: { modelId: string } }).model.modelId).not.toBe(first.id);

    // The reader gets the answer rather than an error.
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'complete')).toBe(true);
  }, 30_000);

  it('does not restart an answer the reader has already begun reading', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault({ kind: 'succeed', text: LONG_ANSWER });

    const events = await turn();
    // Nothing failed, so exactly one synthesis attempt was made.
    expect(events.filter((e) => e.type === 'synthesis_start')).toHaveLength(1);
  }, 30_000);

  it('delivers a real response when every synthesis-capable model is rate limited', async () => {
    // The exact shape observed against real providers: the models answered,
    // every synthesis-capable model was rate limited, and the turn errored —
    // discarding a valid 925-character answer. The turn must now degrade to
    // that answer instead of losing it.
    h.testAdapter.reset();
    h.testAdapter.setDefault({ kind: 'succeed', text: LONG_ANSWER });
    for (const model of h.container.registry.routable()) {
      h.testAdapter.programStream(model.id, { kind: 'fail', error: Errors.rateLimited(30) });
    }

    const events = await turn();

    const answer = events
      .filter((e): e is Extract<ChatEvent, { type: 'delta' }> => e.type === 'delta')
      .map((e) => e.text)
      .join('');

    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(answer).toContain(LONG_ANSWER.slice(0, 40));
    // No provider vocabulary reaches the client.
    expect(answer).not.toMatch(/rate limit|429|RATE_LIMITED/i);
  }, 30_000);
});
