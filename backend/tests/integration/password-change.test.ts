import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createHarness, type Harness } from '../fixtures/harness.ts';

/**
 * Changing a password is a security action, not a settings edit: it
 * re-authenticates, it invalidates other sessions, and it never echoes a
 * credential back.
 */
let harness: Harness;
beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(() => harness.container.limiter.reset());

const CURRENT = 'correct-horse-battery';
const NEXT = 'a-different-passphrase';

async function signedIn(email: string) {
  const c = new Client(harness.app);
  const res = await c.post('/api/auth/register', {
    email,
    password: CURRENT,
    displayName: 'Pw',
  });
  expect(res.status).toBe(201);
  return c;
}

describe('password change', () => {
  it('changes the password for the signed-in user', async () => {
    const c = await signedIn(`pw-ok-${Date.now()}@example.com`);
    const res = await c.post('/api/auth/password', {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });
    expect(res.status).toBe(204);
  });

  it('refuses an unauthenticated request', async () => {
    const c = new Client(harness.app);
    const res = await c.post('/api/auth/password', {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });
    expect(res.status).toBe(401);
  });

  it('refuses an incorrect current password', async () => {
    // Verified rather than trusted from the session: a session can be a
    // borrowed laptop.
    const c = await signedIn(`pw-wrong-${Date.now()}@example.com`);
    const res = await c.post('/api/auth/password', {
      currentPassword: 'not-the-password',
      newPassword: NEXT,
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses a new password that fails the policy', async () => {
    const c = await signedIn(`pw-short-${Date.now()}@example.com`);
    const res = await c.post('/api/auth/password', {
      currentPassword: CURRENT,
      newPassword: 'x',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a new password identical to the current one', async () => {
    // Would revoke every session and change nothing.
    const c = await signedIn(`pw-same-${Date.now()}@example.com`);
    const res = await c.post('/api/auth/password', {
      currentPassword: CURRENT,
      newPassword: CURRENT,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PASSWORD_UNCHANGED');
  });

  it('stops accepting the old password and accepts the new one', async () => {
    const email = `pw-swap-${Date.now()}@example.com`;
    const c = await signedIn(email);
    expect((await c.post('/api/auth/password', { currentPassword: CURRENT, newPassword: NEXT })).status).toBe(204);

    const fresh = new Client(harness.app);
    expect((await fresh.post('/api/auth/login', { email, password: CURRENT })).status).toBe(401);
    expect((await fresh.post('/api/auth/login', { email, password: NEXT })).status).toBe(200);
  });

  it('persists a hash, never the plaintext', async () => {
    const email = `pw-hash-${Date.now()}@example.com`;
    const c = await signedIn(email);
    await c.post('/api/auth/password', { currentPassword: CURRENT, newPassword: NEXT });

    const doc = await harness.container.db.collection('users').findOne({ email });
    expect(doc?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(doc?.passwordHash).not.toContain(NEXT);
    expect(JSON.stringify(doc)).not.toContain(NEXT);
  });

  it('returns nothing about the credential', async () => {
    const c = await signedIn(`pw-body-${Date.now()}@example.com`);
    const res = await c.post('/api/auth/password', {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });
    const body = JSON.stringify(res.body ?? '');
    expect(body).not.toContain(NEXT);
    expect(body).not.toContain(CURRENT);
    expect(body).not.toMatch(/argon2|passwordHash/i);
  });

  it('revokes refresh sessions issued before the change', async () => {
    // The point of changing a password: a stolen refresh token stops working.
    const email = `pw-revoke-${Date.now()}@example.com`;
    const first = new Client(harness.app);
    const registered = await first.post('/api/auth/register', {
      email,
      password: CURRENT,
      displayName: 'Pw',
    });
    expect(registered.status).toBe(201);

    // The refresh token as it was before the change — the thing an attacker
    // would be holding.
    const raw = registered.headers['set-cookie'] as string[];
    const refresh = raw
      .map((c) => c.split(';')[0]!)
      .find((c) => c.startsWith('nx_rt='))!;
    const [, stolenValue] = refresh.split('=');

    const owner = new Client(harness.app);
    expect((await owner.post('/api/auth/login', { email, password: CURRENT })).status).toBe(200);
    expect(
      (await owner.post('/api/auth/password', { currentPassword: CURRENT, newPassword: NEXT }))
        .status,
    ).toBe(204);

    const replay = new Client(harness.app);
    replay.setCookie('nx_rt', stolenValue!);
    expect((await replay.post('/api/auth/refresh')).status).toBe(401);
  });

  it('keeps the caller signed in by re-issuing their session', async () => {
    const c = await signedIn(`pw-keep-${Date.now()}@example.com`);
    await c.post('/api/auth/password', { currentPassword: CURRENT, newPassword: NEXT });

    // The tab that made the change must not be signed out by its own action.
    // Refresh answers 204.
    expect((await c.post('/api/auth/refresh')).status).toBe(204);
  });

  it('refuses a replay of the same change', async () => {
    const c = await signedIn(`pw-replay-${Date.now()}@example.com`);
    expect((await c.post('/api/auth/password', { currentPassword: CURRENT, newPassword: NEXT })).status).toBe(204);
    // The current password is no longer CURRENT, so a duplicate submit fails
    // closed rather than changing anything.
    expect((await c.post('/api/auth/password', { currentPassword: CURRENT, newPassword: NEXT })).status).toBe(401);
  });
});
