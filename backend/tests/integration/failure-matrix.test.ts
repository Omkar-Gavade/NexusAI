import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Agreement, ChatEvent } from '@nexusai/contracts';
import { createHarness, type Harness } from '../fixtures/harness.ts';
import { Errors, type AppError } from '../../src/domain/errors.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

// Every model here shares the `test` provider, so three consecutive retryable
// failures in one row open the circuit and leave the next row with nothing
// routable. That is the breaker working; it just means each row has to start
// from a known-healthy provider to be testing what it claims to test.
beforeEach(() => {
  h.container.registry.health.recordSuccess('test');
});

interface Outcome {
  events: ChatEvent[];
  error: AppError | null;
  agreement: Agreement | undefined;
  answer: string;
}

async function turn(signal = new AbortController().signal): Promise<Outcome> {
  const { user } = await h.container.auth.register({
    email: `fm-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Matrix',
  });

  const events: ChatEvent[] = [];
  let error: AppError | null = null;
  try {
    for await (const event of h.container.orchestrator.run(
      {
        userId: user.id,
        conversationId: null,
        message: 'failure matrix',
        clientMessageId: `fm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        selection: { mode: 'auto', routing: 'balanced' },
        requestId: 'fm-test',
      },
      signal,
    )) {
      events.push(event);
    }
  } catch (thrown) {
    error = thrown as AppError;
  }

  const agreementEvent = events.find((e) => e.type === 'agreement') as
    | { agreement: Agreement }
    | undefined;

  return {
    events,
    error,
    agreement: agreementEvent?.agreement,
    answer: events
      .filter((e) => e.type === 'delta')
      .map((e) => (e as { text: string }).text)
      .join(''),
  };
}

const outcomeOf = (o: Outcome, id: string) =>
  o.events.find(
    (e) => (e.type === 'model_complete' || e.type === 'model_error') && e.modelId === id,
  )?.type;

/**
 * One row per failure the system can actually reach, asserted end to end rather
 * than at the unit that raises it. The product rule under test throughout: a
 * failure is reported as a failure, and nothing is invented to paper over it.
 */
describe('failure matrix', () => {
  it('all three succeed → synthesis, responded 3', async () => {
    h.testAdapter.reset();
    const o = await turn();
    expect(o.error).toBeNull();
    expect(o.agreement).toMatchObject({ requested: 3, responded: 3 });
    expect(o.answer.length).toBeGreaterThan(0);
  }, 30_000);

  it('one fails → synthesis proceeds, responded 2, the failure is reported', async () => {
    h.testAdapter.reset();
    h.testAdapter.program('test-beta', { kind: 'fail', error: Errors.providerError({}) });

    const o = await turn();
    expect(o.error).toBeNull();
    expect(o.agreement).toMatchObject({ requested: 3, responded: 2 });
    expect(outcomeOf(o, 'test-beta')).toBe('model_error');
  }, 30_000);

  it('two fail → the single response is never dressed up as a consensus', async () => {
    h.testAdapter.reset();
    h.testAdapter.program('test-beta', { kind: 'fail', error: Errors.providerError({}) });
    h.testAdapter.program('test-gamma', { kind: 'fail', error: Errors.providerError({}) });

    const o = await turn();
    expect(o.error).toBeNull();
    expect(o.agreement).toMatchObject({ requested: 3, responded: 1 });
    // With one responder there is nothing to agree with.
    expect(o.agreement!.concur + o.agreement!.diverge).toBeLessThanOrEqual(1);
  }, 30_000);

  it('all fail → honest failure, never a fabricated answer', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault({ kind: 'fail', error: Errors.providerError({}) });

    const o = await turn();
    // Not SYNTHESIS_FAILED: synthesis never ran, and that code's message
    // claims responses arrived and could not be reconciled. Nothing arrived.
    expect(o.error?.code).toBe('PROVIDER_UNAVAILABLE');
    expect(o.answer).toBe('');
  }, 30_000);

  it('every model returns empty → treated as no usable response, not as an answer', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault({ kind: 'empty' });

    const o = await turn();
    // Not SYNTHESIS_FAILED: synthesis never ran, and that code's message
    // claims responses arrived and could not be reconciled. Nothing arrived.
    expect(o.error?.code).toBe('PROVIDER_UNAVAILABLE');
    expect(o.answer).toBe('');
  }, 30_000);

  it('provider rate limit → classified as such, and the other models still run', async () => {
    h.testAdapter.reset();
    h.testAdapter.program('test-beta', { kind: 'fail', error: Errors.rateLimited(30) });

    const o = await turn();
    expect(o.error).toBeNull();
    expect(outcomeOf(o, 'test-beta')).toBe('model_error');
    expect(o.agreement).toMatchObject({ responded: 2 });

    // There is no retry layer, so a rate limit cannot become a retry storm:
    // the model was asked exactly once.
    expect(h.testAdapter.calls.filter((id) => id === 'test-beta')).toHaveLength(1);
  }, 30_000);

  it('provider timeout → recorded as a timeout, orchestration continues', async () => {
    h.testAdapter.reset();
    h.testAdapter.program('test-beta', { kind: 'hang', forMs: 20 });

    const o = await turn();
    expect(o.error).toBeNull();
    const failure = o.events.find((e) => e.type === 'model_error' && e.modelId === 'test-beta');
    expect(failure).toMatchObject({ code: 'TIMEOUT' });
    expect(o.agreement).toMatchObject({ requested: 3, responded: 2 });
  }, 30_000);

  it('every synthesis-capable model fails → the best real response is delivered', async () => {
    h.testAdapter.reset();
    // `stream` is the synthesis path, `generate` the fan-out. Failing every
    // stream leaves three good responses with nothing able to reconcile them.
    for (const model of h.container.registry.routable()) {
      h.testAdapter.programStream(model.id, { kind: 'fail', error: Errors.providerUnavailable({}) });
    }

    const o = await turn();

    // The models answered, so their work is delivered rather than discarded.
    // This previously produced an error on screen while a valid response sat
    // unused in memory — observed live against real providers, where Groq's
    // 925-character answer was thrown away because Gemini was rate limited.
    expect(o.events.filter((e) => e.type === 'model_complete')).toHaveLength(3);
    expect(o.error).toBeNull();
    expect(o.answer.length).toBeGreaterThan(0);
    expect(o.events.some((e) => e.type === 'complete')).toBe(true);
    expect(o.agreement).toMatchObject({ requested: 3, responded: 3 });
  }, 30_000);

  it('a malformed provider response is reported, never rendered as an answer', async () => {
    h.testAdapter.reset();
    // Whitespace only: structurally a response, semantically nothing.
    h.testAdapter.program('test-beta', { kind: 'succeed', text: '   \n  ' });

    const o = await turn();
    expect(o.error).toBeNull();
    // Not counted as having responded, because nothing usable came back.
    expect(o.agreement).toMatchObject({ requested: 3, responded: 2 });
  }, 30_000);

  it('client aborts before the fan-out → no provider is called', async () => {
    h.testAdapter.reset();
    const controller = new AbortController();
    controller.abort();

    const o = await turn(controller.signal);
    expect(o.events.some((e) => e.type === 'cancelled')).toBe(true);
    expect(h.testAdapter.calls).toHaveLength(0);
  }, 30_000);
});

/**
 * A provider that stops responding and a user who leaves are different events,
 * and the difference is visible to the reader: provenance renders one as
 * "cancelled" and the other as a failure, and only the failure counts against
 * provider health.
 *
 * The adapter cannot tell them apart — it receives a single combined signal —
 * so the distinction has to be made where both signals are still in scope.
 */
describe('timeout is not cancellation', () => {
  it('records a provider that ran long as a timeout, not as the user leaving', async () => {
    // Its own harness with a short per-call timeout, so the case is exercised
    // in milliseconds rather than by actually waiting a minute.
    const short = await createHarness({ MODEL_TIMEOUT_MS: '250' });
    try {
      short.testAdapter.reset();
      short.testAdapter.program('test-beta', { kind: 'hang', forMs: 5_000 });

      const { user } = await short.container.auth.register({
        email: `to-${Date.now()}@example.test`,
        password: 'a-sufficiently-long-password',
        displayName: 'Timeout',
      });

      const events: ChatEvent[] = [];
      for await (const event of short.container.orchestrator.run(
        {
          userId: user.id,
          conversationId: null,
          message: 'slow provider',
          clientMessageId: `to-${Date.now()}`,
          selection: { mode: 'auto', routing: 'balanced' },
          requestId: 'timeout-test',
        },
        new AbortController().signal,
      )) {
        events.push(event);
      }

      const failure = events.find((e) => e.type === 'model_error' && e.modelId === 'test-beta');
      // The reader is told the provider stopped responding, not that they left.
      expect(failure).toMatchObject({ code: 'TIMEOUT' });
    } finally {
      await short.close();
    }
  }, 60_000);

  it('still records an actual client abort as cancellation', async () => {
    h.testAdapter.reset();
    const controller = new AbortController();
    controller.abort();

    const o = await turn(controller.signal);
    expect(o.events.some((e) => e.type === 'cancelled')).toBe(true);
  }, 30_000);
});
