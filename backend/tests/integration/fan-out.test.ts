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

    const alpha = completedAt('test-alpha');
    const beta = completedAt('test-beta');
    const gamma = completedAt('test-gamma');

    /*
     * Proven by order and by spread, not by an absolute deadline.
     *
     * This assertion used to be `last < 1500ms`, on the reasoning that
     * sequential execution needs 200+900+400 of model time. It was correct and
     * it was brittle: every mark carries the machine's own overhead, so a
     * loaded CI box pushed a genuinely concurrent fan-out past the bound and
     * failed a test about concurrency for reasons that had nothing to do with
     * it.
     *
     * Both properties below are immune to that, because overhead shifts every
     * mark by roughly the same amount and therefore cancels.
     */

    // 1. Order. Concurrent models finish in order of their own duration.
    //    Sequential execution finishes them in plan order whatever their
    //    delays, so alpha(200) < gamma(400) < beta(900) cannot hold.
    expect(alpha).toBeLessThan(gamma);
    expect(gamma).toBeLessThan(beta);

    // 2. Spread. Concurrently the window between first and last completion is
    //    the difference between the slowest and fastest model — about 700ms.
    //    Sequentially it would be 1300ms, because each model starts only after
    //    the previous one finished. Comparing a difference rather than an
    //    absolute time is what makes this hold on a loaded machine.
    expect(beta - alpha).toBeLessThan(1000);

    // 3. A floor, which load can only push further from failing: the slowest
    //    model genuinely waited, so nothing was skipped or stubbed out.
    expect(beta).toBeGreaterThanOrEqual(900);
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
