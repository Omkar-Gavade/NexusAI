import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatEvent } from '@nexusai/contracts';
import { createHarness, type Harness } from '../fixtures/harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/** Runs one turn, recording when each event was actually observed. */
async function timeline(delays: Record<string, number>) {
  const { testAdapter, container } = h;
  testAdapter.reset();
  for (const [modelId, delayMs] of Object.entries(delays)) {
    testAdapter.program(modelId, { kind: 'succeed', delayMs, text: `text from ${modelId}` });
  }

  const { user } = await container.auth.register({
    email: `fanout-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Fan Out',
  });

  const marks: Array<{ event: ChatEvent; at: number }> = [];
  const startedAt = Date.now();

  for await (const event of container.orchestrator.run(
    {
      userId: user.id,
      conversationId: null,
      message: 'fan-out timing',
      clientMessageId: `fanout-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      selection: { mode: 'auto', routing: 'balanced' },
      requestId: 'fanout-test',
    },
    new AbortController().signal,
  )) {
    marks.push({ event, at: Date.now() - startedAt });
  }

  const completedAt = (modelId: string) =>
    marks.find((m) => m.event.type === 'model_complete' && m.event.modelId === modelId)!.at;

  return { marks, completedAt, totalMs: marks.at(-1)!.at };
}

/**
 * Concurrency has to be observable, not inferred from the presence of a
 * `Promise.all`. Three models are given staggered delays, and both properties
 * that matter are asserted against the clock.
 */
describe('model fan-out', () => {
  it('executes models concurrently rather than in sequence', async () => {
    const { completedAt } = await timeline({
      'test-alpha': 200,
      'test-beta': 900,
      'test-gamma': 400,
    });

    // Measured across the fan-out window rather than the whole turn: the turn
    // also pays for synthesis and three database writes, and on a loaded
    // machine that overhead made a genuinely concurrent fan-out look sequential.
    const lastModel = Math.max(
      completedAt('test-alpha'),
      completedAt('test-beta'),
      completedAt('test-gamma'),
    );

    // Sequential execution needs at least 1500ms of model time; concurrent
    // execution is bounded below by the slowest model alone, 900ms.
    expect(lastModel).toBeGreaterThanOrEqual(900);
    expect(lastModel).toBeLessThan(1500);
  }, 30_000);

  it('reports each model the moment it lands, not when the slowest finishes', async () => {
    const { completedAt } = await timeline({
      'test-alpha': 100,
      'test-beta': 900,
      'test-gamma': 400,
    });

    // The regression this guards: buffering the fan-out and flushing it after
    // Promise.all, which made every model appear to finish simultaneously and
    // left the provenance rail unable to show a model completing early.
    expect(completedAt('test-alpha')).toBeLessThan(completedAt('test-gamma'));
    expect(completedAt('test-gamma')).toBeLessThan(completedAt('test-beta'));
    expect(completedAt('test-beta') - completedAt('test-alpha')).toBeGreaterThan(500);
  }, 30_000);
});
