import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../fixtures/harness.ts';
import { Errors } from '../../src/domain/errors.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function newUser() {
  const { user } = await h.container.auth.register({
    email: `health-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Health',
  });
  return user.id;
}

async function turn(userId: string) {
  const events = [];
  try {
    for await (const event of h.container.orchestrator.run(
      {
        userId,
        conversationId: null,
        message: 'health probe',
        clientMessageId: `health-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        selection: { mode: 'auto', routing: 'balanced' },
        requestId: 'health-test',
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
  } catch {
    // A turn where every model failed throws; the health effect is the subject.
  }
  return events;
}

/**
 * Health is asserted through the orchestrator rather than by calling the
 * tracker directly. The defect this guards was invisible to a direct unit test:
 * the tracker handled auth failures correctly, but the orchestrator gated the
 * call on `retryable`, so a rejected credential never arrived.
 */
describe('provider health from real turns', () => {
  it('marks a provider unavailable once its credentials are rejected', async () => {
    const { testAdapter, container } = h;
    testAdapter.reset();
    testAdapter.setDefault({ kind: 'fail', error: Errors.providerAuthError({}) });

    expect(container.registry.health.availability('test', true)).toBe('UNKNOWN');

    await turn(await newUser());

    expect(container.registry.health.availability('test', true)).toBe(
      'CONFIGURED_BUT_UNAVAILABLE',
    );

    // And the client is told why, rather than being offered a model that cannot run.
    const wire = container.registry.toWire().find((m) => m.id === 'test-alpha');
    expect(wire?.availability).toBe('CONFIGURED_BUT_UNAVAILABLE');
    expect(wire?.availabilityReason).toBe('The configured credentials were rejected.');
    expect(container.registry.routable()).toHaveLength(0);
    expect(container.registry.autoAvailable()).toBe(false);
  }, 30_000);

  // Without this the provider is dead for the lifetime of the process: it is
  // no longer routable, so no call is made, so no success can ever clear the
  // flag — a fixed or rotated key would go unnoticed until a restart.
  it('re-checks a rejected credential once the cooldown elapses', async () => {
    const { testAdapter, container } = h;
    testAdapter.reset();
    testAdapter.setDefault({ kind: 'fail', error: Errors.providerAuthError({}) });
    await turn(await newUser());

    const health = container.registry.health;
    expect(health.availability('test', true)).toBe('CONFIGURED_BUT_UNAVAILABLE');

    const later = Date.now() + 16 * 60_000;
    expect(health.availability('test', true, later)).toBe('UNKNOWN');
  }, 30_000);

  it('clears the auth failure once a call succeeds again', async () => {
    const { testAdapter, container } = h;
    testAdapter.reset();
    testAdapter.setDefault({ kind: 'fail', error: Errors.providerAuthError({}) });
    await turn(await newUser());
    expect(container.registry.health.availability('test', true)).toBe(
      'CONFIGURED_BUT_UNAVAILABLE',
    );

    // The operator fixes the key; the next call that gets through recovers it.
    testAdapter.reset();
    container.registry.health.recordSuccess('test');

    expect(container.registry.health.availability('test', true)).toBe('AVAILABLE');
    expect(container.registry.autoAvailable()).toBe(true);
  }, 30_000);
});
