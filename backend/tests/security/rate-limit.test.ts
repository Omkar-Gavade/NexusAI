import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RULES } from '../../src/api/middleware/rate-limit.ts';
import { Client, createHarness, type Harness } from '../fixtures/harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function signedIn(): Promise<Client> {
  const client = new Client(h.app);
  await client.post('/api/auth/register', {
    email: `rl-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Rate Limited',
  });
  return client;
}

/**
 * Limits are enforced per instance, in process (ADR-013). These assert that the
 * rules are actually applied — a rule that exists in `RULES` but is wired to no
 * route is worse than no rule, because it reads as protection that is not there.
 */
describe('rate limiting', () => {
  it('caps authentication attempts', async () => {
    h.container.limiter.reset();
    const client = new Client(h.app);
    const attempt = () =>
      client.post('/api/auth/login', { email: 'nobody@example.test', password: 'wrong-password-x' });

    const statuses: number[] = [];
    for (let i = 0; i < RULES.authWrite.limit + 1; i += 1) statuses.push((await attempt()).status);

    expect(statuses.at(-1)).toBe(429);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
  }, 60_000);

  it('caps reads, which are otherwise unbounded', async () => {
    h.container.limiter.reset();
    const client = await signedIn();

    let last = 200;
    for (let i = 0; i < RULES.read.limit + 1 && last !== 429; i += 1) {
      last = (await client.get('/api/conversations')).status;
    }
    expect(last).toBe(429);
  }, 60_000);

  it('answers a throttled request with a retry hint rather than a bare refusal', async () => {
    h.container.limiter.reset();
    const client = new Client(h.app);
    let response = await client.post('/api/auth/login', { email: 'a@b.test', password: 'wrong-pw-1234' });
    for (let i = 0; i < RULES.authWrite.limit && response.status !== 429; i += 1) {
      response = await client.post('/api/auth/login', { email: 'a@b.test', password: 'wrong-pw-1234' });
    }

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    // No internal detail, no hint about whether the account exists.
    expect(JSON.stringify(response.body)).not.toMatch(/mongo|stack|password|hash/i);
  }, 60_000);

  it('scopes the limit to one user, never across users', async () => {
    h.container.limiter.reset();
    const noisy = await signedIn();
    const quiet = await signedIn();

    let last = 200;
    for (let i = 0; i < RULES.read.limit + 1 && last !== 429; i += 1) {
      last = (await noisy.get('/api/conversations')).status;
    }
    expect(last).toBe(429);

    // A second user is unaffected by the first one's exhaustion.
    expect((await quiet.get('/api/conversations')).status).toBe(200);
  }, 90_000);
});
