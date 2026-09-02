import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatEvent } from '@nexusai/contracts';
import { createHarness, type Harness } from '../fixtures/harness.ts';
import { Errors, type AppError } from '../../src/domain/errors.ts';

/**
 * When an answer is delivered without synthesis.
 *
 * Every case here comes from a real failure observed against live providers:
 * three of four models were unavailable, Groq answered in 1314ms with 925
 * characters, and the orchestrator chose the already-rate-limited Gemini to
 * synthesise. The turn errored and Groq's answer was discarded. An explicit
 * single-model selection of Groq failed the same way, because synthesis was
 * unconditional and the synthesist was picked from the registry with no regard
 * for the plan or for what had just failed.
 */
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  h.container.registry.health.recordSuccess('test');
});

interface Outcome {
  events: ChatEvent[];
  error: AppError | null;
  answer: string;
  synthesist: string | null;
}

async function turn(
  selection: { mode: 'auto'; routing: 'balanced' } | { mode: 'manual'; modelId: string } = {
    mode: 'auto',
    routing: 'balanced',
  },
): Promise<Outcome> {
  const { user } = await h.container.auth.register({
    email: `da-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Direct',
  });

  const events: ChatEvent[] = [];
  let error: AppError | null = null;
  try {
    for await (const event of h.container.orchestrator.run(
      {
        userId: user.id,
        conversationId: null,
        message: 'direct answer',
        clientMessageId: `da-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        selection,
        requestId: 'da-test',
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
  } catch (thrown) {
    error = thrown as AppError;
  }

  const start = events.find((e) => e.type === 'synthesis_start') as
    | { model: { modelId: string } }
    | undefined;

  return {
    events,
    error,
    answer: events
      .filter((e): e is Extract<ChatEvent, { type: 'delta' }> => e.type === 'delta')
      .map((e) => e.text)
      .join(''),
    synthesist: start?.model.modelId ?? null,
  };
}

const fail = { kind: 'fail', error: Errors.providerUnavailable({}) } as const;

describe('one successful response is answered directly', () => {
  it('skips synthesis entirely and returns the response', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault(fail);
    h.testAdapter.program('test-gamma', { kind: 'succeed', text: 'The sole answer.' });

    const o = await turn();

    expect(o.error).toBeNull();
    expect(o.answer).toBe('The sole answer.');
    // No synthesis pass at all: there is nothing to reconcile.
    expect(o.synthesist).toBeNull();
    expect(o.events.some((e) => e.type === 'complete')).toBe(true);
  }, 30_000);

  it('works when the only responder cannot itself synthesise', async () => {
    // `test-gamma` is synthesisCapable: false — exactly Groq's situation. The
    // answer must still be delivered rather than requiring another model.
    expect(h.container.registry.find('test-gamma')?.synthesisCapable).toBe(false);

    h.testAdapter.reset();
    h.testAdapter.setDefault(fail);
    h.testAdapter.program('test-gamma', { kind: 'succeed', text: 'Non-synthesist answer.' });

    const o = await turn();
    expect(o.error).toBeNull();
    expect(o.answer).toBe('Non-synthesist answer.');
    expect(o.synthesist).toBeNull();
  }, 30_000);

  it('claims no agreement it did not measure', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault(fail);
    h.testAdapter.program('test-gamma', { kind: 'succeed', text: 'Only one.' });

    const o = await turn();
    const agreement = o.events.find((e) => e.type === 'agreement') as
      | { agreement: { responded: number; concur: number; diverge: number } }
      | undefined;

    expect(agreement?.agreement.responded).toBe(1);
    // Nothing compared anything, so nothing concurred or diverged.
    expect(agreement?.agreement.concur).toBe(0);
    expect(agreement?.agreement.diverge).toBe(0);
  }, 30_000);
});

describe('explicit single-model selection', () => {
  it('returns the chosen model’s answer without involving another model', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault(fail);
    h.testAdapter.program('test-gamma', { kind: 'succeed', text: 'Chosen model answer.' });

    const o = await turn({ mode: 'manual', modelId: 'test-gamma' });

    expect(o.error).toBeNull();
    expect(o.answer).toBe('Chosen model answer.');
    // The bug: an unrelated registry model was selected to rewrite this.
    expect(o.synthesist).toBeNull();
  }, 30_000);

  it('fails safely when the chosen model fails', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault(fail);

    const o = await turn({ mode: 'manual', modelId: 'test-gamma' });

    expect(o.error).not.toBeNull();
    expect(o.answer).toBe('');
    expect(o.events.some((e) => e.type === 'complete')).toBe(false);
  }, 30_000);
});

describe('synthesist selection', () => {
  it('never chooses a model that already failed this turn', async () => {
    // `test-alpha` fails the fan-out but its stream would succeed. Before the
    // fix it was still eligible to write the answer, which is precisely what
    // happened live with Gemini.
    h.testAdapter.reset();
    h.testAdapter.setDefault({ kind: 'succeed', text: 'a response' });
    h.testAdapter.program('test-alpha', fail);

    const o = await turn();

    expect(o.error).toBeNull();
    expect(o.synthesist).not.toBeNull();
    expect(o.synthesist).not.toBe('test-alpha');
  }, 30_000);

  it('still synthesises when two or more models respond', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault({ kind: 'succeed', text: 'a response' });

    const o = await turn();

    expect(o.error).toBeNull();
    // Two or more contributions means a real synthesis pass runs.
    expect(o.synthesist).not.toBeNull();
  }, 30_000);
});

describe('an all-failed turn reports what actually happened', () => {
  it('names the single chosen model rather than blaming synthesis', async () => {
    // Observed live: an explicitly selected model failed and the user was told
    // "the individual responses arrived, but couldn't be reconciled" — false on
    // both counts. Nothing arrived, and synthesis never ran.
    h.testAdapter.reset();
    h.testAdapter.setDefault(fail);

    const o = await turn({ mode: 'manual', modelId: 'test-gamma' });

    expect(o.error).not.toBeNull();
    expect(o.error?.code).toBe('MODEL_UNAVAILABLE');
    expect(o.error?.message).toMatch(/Test Gamma/);
    expect(o.error?.message).not.toMatch(/reconcile|synthesis/i);
  }, 30_000);

  it('does not name a model when several were planned and all failed', async () => {
    // Listing every provider that failed is operator detail; the reader's next
    // move is the same either way.
    h.testAdapter.reset();
    h.testAdapter.setDefault(fail);

    const o = await turn();

    expect(o.error?.code).toBe('PROVIDER_UNAVAILABLE');
    expect(o.error?.message).not.toMatch(/reconcile/i);
  }, 30_000);
});
