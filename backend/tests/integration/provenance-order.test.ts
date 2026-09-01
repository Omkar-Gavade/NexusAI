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

async function run(): Promise<{ events: ChatEvent[]; messageId: string }> {
  const { user } = await h.container.auth.register({
    email: `prov-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Prov',
  });

  const events: ChatEvent[] = [];
  try {
    for await (const event of h.container.orchestrator.run(
      {
        userId: user.id,
        conversationId: null,
        message: 'ordering',
        clientMessageId: `prov-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        selection: { mode: 'auto', routing: 'balanced' },
        requestId: 'prov-test',
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
  } catch {
    // An all-failed turn throws; the persisted provenance is the subject.
  }

  const start = events.find((e) => e.type === 'start') as { messageId: string } | undefined;
  return { events, messageId: start?.messageId ?? '' };
}

async function persistedResponses(messageId: string) {
  const doc = await h.db.collection('messages').findOne({ _id: new ObjectId(messageId) });
  return (doc?.responses ?? []) as Array<{
    model: { modelId: string };
    outcome: string;
    stance: string;
    latencyMs: number;
    errorCode: string | null;
  }>;
}

/**
 * Rail position identifies a model, so it is derived from the execution plan
 * and must not move when models finish in a different order.
 *
 * This matters more since events began being emitted as each model lands
 * rather than all at once: arrival order is now genuinely non-deterministic,
 * and the plan is the only thing holding position stable.
 */
describe('provenance ordering', () => {
  it('keeps plan order in the plan and in persistence while models finish out of order', async () => {
    h.testAdapter.reset();
    h.testAdapter.program('test-alpha', { kind: 'succeed', delayMs: 400, text: 'from alpha' });
    h.testAdapter.program('test-beta', { kind: 'succeed', delayMs: 700, text: 'from beta' });
    h.testAdapter.program('test-gamma', { kind: 'succeed', delayMs: 100, text: 'from gamma' });

    const { events, messageId } = await run();

    const planned = (events.find((e) => e.type === 'start') as { plan: Array<{ modelId: string }> })
      .plan.map((m) => m.modelId);
    const arrival = events
      .filter((e) => e.type === 'model_complete')
      .map((e) => (e as { modelId: string }).modelId);

    // Gamma is fastest, so it genuinely arrives first — the point of the test.
    expect(arrival[0]).toBe('test-gamma');
    expect(arrival).not.toEqual(planned);

    // The plan the rail renders from is unchanged, and so is what was stored.
    expect(planned).toEqual(['test-alpha', 'test-beta', 'test-gamma']);
    const stored = await persistedResponses(messageId);
    expect(stored.map((r) => r.model.modelId)).toEqual(planned);
  }, 30_000);

  it('records each model against its own result, not its neighbour’s', async () => {
    h.testAdapter.reset();
    h.testAdapter.program('test-alpha', { kind: 'succeed', delayMs: 300, text: 'ALPHA-TEXT' });
    h.testAdapter.program('test-beta', { kind: 'fail', error: Errors.providerError({}) });
    h.testAdapter.program('test-gamma', { kind: 'succeed', delayMs: 50, text: 'GAMMA-TEXT' });

    const { events, messageId } = await run();
    const stored = await persistedResponses(messageId);
    const by = (id: string) => stored.find((r) => r.model.modelId === id)!;

    expect(by('test-alpha').outcome).toBe('complete');
    expect(by('test-beta').outcome).toBe('failed');
    expect(by('test-gamma').outcome).toBe('complete');

    // A failed model is never assigned a stance, and never claims latency it
    // did not spend answering.
    expect(by('test-beta').stance).toBe('unknown');
    expect(by('test-beta').errorCode).toBe('PROVIDER_ERROR');

    // The count the rail reports is the count that actually answered.
    const agreement = events.find((e) => e.type === 'agreement') as
      | { agreement: { requested: number; responded: number } }
      | undefined;
    expect(agreement!.agreement).toMatchObject({ requested: 3, responded: 2 });
  }, 30_000);

  it('keeps a failed model in provenance rather than dropping it from the rail', async () => {
    h.testAdapter.reset();
    h.testAdapter.setDefault({ kind: 'succeed', text: 'ok' });
    h.testAdapter.program('test-beta', { kind: 'fail', error: Errors.timeout({}) });

    const { messageId } = await run();
    const stored = await persistedResponses(messageId);

    // Three segments, always: a missing segment would misreport the fan-out.
    expect(stored).toHaveLength(3);
    expect(stored.find((r) => r.model.modelId === 'test-beta')!.errorCode).toBe('TIMEOUT');
  }, 30_000);
});
