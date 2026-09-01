import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { Client, createHarness, ulid, type Harness } from '../fixtures/harness.ts';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(() => {
  harness.testAdapter.reset();
  harness.container.registry.health.reset();
});

async function userId(): Promise<string> {
  const c = new Client(harness.app);
  const { user } = await c.signUp();
  return user.id;
}

/**
 * Cancellation is driven by the client's fetch abort — there is no cancel
 * endpoint and the client will never call one. These tests drive the
 * orchestrator directly so the abort can be triggered mid-flight.
 */
describe('cancellation', () => {
  // Disconnecting while the plan is still being announced: the cheapest and
  // most valuable outcome is that no provider is ever called.
  it('never calls a provider when the client has already disconnected', async () => {
    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 5_000 });

    const controller = new AbortController();
    const events: string[] = [];

    for await (const event of harness.container.orchestrator.run(
      {
        userId: await userId(),
        conversationId: null,
        message: 'A question that will be cancelled.',
        clientMessageId: ulid(),
        selection: { mode: 'auto', routing: 'balanced' },
        requestId: 'test-cancel',
      },
      controller.signal,
    )) {
      events.push(event.type);
      if (event.type === 'model_start') controller.abort();
    }

    expect(harness.testAdapter.calls).toHaveLength(0);
    expect(events).toContain('cancelled');
    expect(events).not.toContain('complete');
    // Synthesis is never reached, so no paid synthesis call is made either.
    expect(events).not.toContain('synthesis_start');
  });

  // Disconnecting once the calls are genuinely in flight: the abort has to
  // reach the provider request, not merely stop the stream being read.
  it('aborts provider calls that are already in flight', async () => {
    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 5_000 });

    const controller = new AbortController();
    const events: string[] = [];

    // Abort once the adapter has genuinely been entered, rather than on a
    // wall-clock timer — the database writes before the fan-out take a variable
    // amount of time, and a timer races them.
    const poll = setInterval(() => {
      if (harness.testAdapter.calls.length > 0) {
        clearInterval(poll);
        controller.abort();
      }
    }, 5);
    const timer = { [Symbol.dispose]: () => clearInterval(poll) };
    void timer;

    try {
      for await (const event of harness.container.orchestrator.run(
        {
          userId: await userId(),
          conversationId: null,
          message: 'Cancelled mid-flight.',
          clientMessageId: ulid(),
          selection: { mode: 'auto', routing: 'balanced' },
          requestId: 'test-cancel-inflight',
        },
        controller.signal,
      )) {
        events.push(event.type);
      }
    } finally {
      clearInterval(poll);
    }

    expect(harness.testAdapter.calls.length).toBeGreaterThan(0);
    expect(harness.testAdapter.aborted.length).toBeGreaterThan(0);
    expect(events).toContain('cancelled');
    expect(events).not.toContain('complete');
  }, 10_000);

  it('persists the turn as cancelled, never as complete', async () => {
    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 5_000 });

    const controller = new AbortController();
    const uid = await userId();
    let messageId = '';

    for await (const event of harness.container.orchestrator.run(
      {
        userId: uid,
        conversationId: null,
        message: 'Cancelled turn.',
        clientMessageId: ulid(),
        selection: { mode: 'auto', routing: 'single' },
        requestId: 'test-cancel-2',
      },
      controller.signal,
    )) {
      if (event.type === 'start') messageId = event.messageId;
      if (event.type === 'model_start') controller.abort();
    }

    const stored = await harness.db
      .collection('messages')
      .findOne({ _id: new ObjectId(messageId) });

    expect(stored?.status).toBe('cancelled');
  });

  it('leaves no message in a non-terminal state', async () => {
    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 3_000 });
    const controller = new AbortController();

    for await (const event of harness.container.orchestrator.run(
      {
        userId: await userId(),
        conversationId: null,
        message: 'Another cancelled turn.',
        clientMessageId: ulid(),
        selection: { mode: 'auto', routing: 'single' },
        requestId: 'test-cancel-3',
      },
      controller.signal,
    )) {
      if (event.type === 'model_start') controller.abort();
    }

    const terminal = ['complete', 'cancelled', 'failed', 'failed_partial'];
    const nonTerminal = await harness.db
      .collection('messages')
      .countDocuments({ status: { $nin: terminal } });

    expect(nonTerminal).toBe(0);
  });

  it('does not count a cancelled model against provider health', async () => {
    harness.testAdapter.setDefault({ kind: 'succeed', delayMs: 3_000 });
    const controller = new AbortController();

    for await (const event of harness.container.orchestrator.run(
      {
        userId: await userId(),
        conversationId: null,
        message: 'Health should be untouched.',
        clientMessageId: ulid(),
        selection: { mode: 'auto', routing: 'balanced' },
        requestId: 'test-cancel-4',
      },
      controller.signal,
    )) {
      if (event.type === 'model_start') controller.abort();
    }

    // A user changing their mind is not a provider outage.
    expect(harness.container.registry.availabilityOf(harness.container.registry.find('test-alpha')!))
      .not.toBe('TEMPORARILY_UNAVAILABLE');
  });
});
