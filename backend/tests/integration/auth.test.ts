import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD_MIN } from '@nexusai/contracts';
import { Client, createHarness, type Harness } from '../fixtures/harness.ts';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../src/api/middleware/authenticate.ts';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(() => {
  harness.container.limiter.reset();
});

const client = () => new Client(harness.app);

describe('registration', () => {
  it('creates an account and issues both cookies', async () => {
    const c = client();
    const res = await c.post('/api/auth/register', {
      email: 'first@example.com',
      password: 'correct-horse-battery',
      displayName: 'First',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('first@example.com');

    const cookies = String(res.headers['set-cookie']);
    expect(cookies).toContain(ACCESS_COOKIE);
    expect(cookies).toContain(REFRESH_COOKIE);
    expect(cookies).toContain('HttpOnly');
    // Refresh is scoped so a top-level cross-site navigation cannot reach it.
    expect(cookies).toContain('Path=/api/auth');
  });

  it('never returns the password hash', async () => {
    const c = client();
    const res = await c.post('/api/auth/register', {
      email: 'nohash@example.com',
      password: 'correct-horse-battery',
      displayName: 'No Hash',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/i);
  });

  it('rejects a duplicate email', async () => {
    const c = client();
    const payload = {
      email: 'dupe@example.com',
      password: 'correct-horse-battery',
      displayName: 'Dupe',
    };
    expect((await c.post('/api/auth/register', payload)).status).toBe(201);

    const second = await client().post('/api/auth/register', payload);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('treats email as case-insensitive at the constraint level', async () => {
    await client().post('/api/auth/register', {
      email: 'Case@example.com',
      password: 'correct-horse-battery',
      displayName: 'Case',
    });
    const second = await client().post('/api/auth/register', {
      email: 'case@example.com',
      password: 'correct-horse-battery',
      displayName: 'Case',
    });
    expect(second.status).toBe(409);
  });

  // Bounds, not a single sample: the value below the minimum and the value at
  // it. `'tooshort'` used to serve as the rejected case and is eight characters
  // — it silently became a *valid* password when the minimum moved to four.
  it.each([1, 2, 3])('rejects a %i-character password', async (length) => {
    const res = await client().post('/api/auth/register', {
      email: `short-${length}@example.com`,
      password: 'x'.repeat(length),
      displayName: 'Short',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: any) => d.path === 'password')).toBe(true);
  });

  it.each([PASSWORD_MIN, PASSWORD_MIN + 1, 20])(
    'accepts a %i-character password',
    async (length) => {
      const res = await client().post('/api/auth/register', {
        email: `len-${length}-${Date.now()}@example.com`,
        password: 'x'.repeat(length),
        displayName: 'Long Enough',
      });

      expect(res.status).toBe(201);
    },
  );

  // The rule that was removed. Without this, raising the minimum back to 12 by
  // accident would pass every other test in this file.
  it('no longer enforces the old twelve-character minimum', async () => {
    expect(PASSWORD_MIN).toBeLessThan(12);

    const res = await client().post('/api/auth/register', {
      email: `eleven-${Date.now()}@example.com`,
      password: 'x'.repeat(11),
      displayName: 'Eleven',
    });
    expect(res.status).toBe(201);
  });
});

describe('login', () => {
  const account = {
    email: 'login@example.com',
    password: 'correct-horse-battery',
    displayName: 'Login',
  };

  beforeAll(async () => {
    await client().post('/api/auth/register', account);
  });

  it('signs in with correct credentials', async () => {
    const res = await client().post('/api/auth/login', {
      email: account.email,
      password: account.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(account.email);
  });

  // Distinguishing the two would be an account-enumeration oracle.
  it('gives an identical response for a wrong password and an unknown account', async () => {
    const wrong = await client().post('/api/auth/login', {
      email: account.email,
      password: 'wrong-password-entirely',
    });
    const unknown = await client().post('/api/auth/login', {
      email: 'nobody@example.com',
      password: 'wrong-password-entirely',
    });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });
});

describe('sessions', () => {
  it('rejects an unauthenticated request with UNAUTHENTICATED, not TOKEN_EXPIRED', async () => {
    const res = await client().get('/api/auth/me');
    expect(res.status).toBe(401);
    // The client refreshes on TOKEN_EXPIRED and signs out on UNAUTHENTICATED.
    // Collapsing them breaks the whole session lifecycle.
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('reports an expired access token as TOKEN_EXPIRED so the client refreshes', async () => {
    const short = await createHarness({ ACCESS_TOKEN_TTL_SECONDS: '1' });
    try {
      const c = new Client(short.app);
      await c.signUp('expiring@example.com');
      expect((await c.get('/api/auth/me')).status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const res = await c.get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    } finally {
      await short.close();
    }
  });

  it('refreshes and rotates', async () => {
    const c = client();
    await c.signUp();
    const res = await c.post('/api/auth/refresh');
    expect(res.status).toBe(204);
    expect((await c.get('/api/auth/me')).status).toBe(200);
  });

  it('rejects a refresh with no cookie', async () => {
    const res = await client().post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  // Two tabs can legitimately refresh at once; the grace window is what stops
  // ordinary use from tripping reuse detection.
  it('allows a rotated token to be reused inside the grace window', async () => {
    const c = client();
    await c.signUp();
    const original = (c as any).cookies.get(REFRESH_COOKIE) as string;

    expect((await c.post('/api/auth/refresh')).status).toBe(204);

    c.setCookie(REFRESH_COOKIE, original);
    expect((await c.post('/api/auth/refresh')).status).toBe(204);
  });

  it('revokes the whole family when a rotated token is replayed after the grace window', async () => {
    const c = client();
    const { user } = await c.signUp();
    const original = (c as any).cookies.get(REFRESH_COOKIE) as string;

    await c.post('/api/auth/refresh');
    const before = await harness.db
      .collection('sessions')
      .countDocuments({ userId: new ObjectId(user.id) });
    expect(before).toBeGreaterThan(0);

    // Age the rotation past the grace window directly, rather than sleeping.
    await harness.db
      .collection('sessions')
      .updateMany({}, { $set: { rotatedAt: new Date(Date.now() - 120_000) } });

    c.setCookie(REFRESH_COOKIE, original);
    const replayed = await c.post('/api/auth/refresh');

    expect(replayed.status).toBe(401);
    expect(replayed.body.error.code).toBe('SESSION_REVOKED');

    // Every descendant of the leaked token is gone, not just the replayed one.
    const remaining = await harness.db
      .collection('sessions')
      .countDocuments({ userId: new ObjectId(user.id) });
    expect(remaining).toBe(0);
  });

  it('logs out, invalidating the family', async () => {
    const c = client();
    await c.signUp();
    expect((await c.post('/api/auth/logout')).status).toBe(204);

    const res = await c.post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  // Access tokens are stateless by design: `authenticate` verifies the
  // signature and expiry and does not read the session store, which is what
  // keeps an authenticated request from costing a database round trip. The
  // consequence is that logout revokes the *refresh family* immediately but a
  // token already issued stays valid until it expires.
  //
  // This is asserted rather than left implicit so the window is a decision on
  // the record, not a surprise. Shortening it means lowering
  // ACCESS_TOKEN_TTL_SECONDS; closing it entirely means a session lookup on
  // every request, which is a different architecture.
  it('leaves an already-issued access token usable until it expires, even after logout', async () => {
    const c = client();
    const registered = await c.post('/api/auth/register', {
      email: `stateless-${Date.now()}@example.test`,
      password: 'a-sufficiently-long-password',
      displayName: 'Stateless',
    });
    expect(registered.status).toBe(201);

    const raw = registered.headers['set-cookie'] as string[];
    const access = raw.find((entry) => entry.startsWith('nx_at='))!;
    const accessValue = access.slice('nx_at='.length, access.indexOf(';'));

    expect((await c.post('/api/auth/logout')).status).toBe(204);
    // The browser drops the cookie, so the client is signed out in practice.
    expect((await c.get('/api/auth/me')).status).toBe(401);

    // A retained copy of the token still authenticates until it expires.
    c.setCookie('nx_at', accessValue);
    expect((await c.get('/api/auth/me')).status).toBe(200);

    // What logout does guarantee: the session cannot be extended.
    expect((await c.post('/api/auth/refresh')).status).toBe(401);
  });

  it('treats logout without a session as success', async () => {
    expect((await client().post('/api/auth/logout')).status).toBe(204);
  });
});

describe('profile', () => {
  it('updates preferences without clobbering unset fields', async () => {
    const c = client();
    await c.signUp();

    const res = await c.patch('/api/auth/me', { preferences: { theme: 'dark' } });
    expect(res.status).toBe(200);
    expect(res.body.user.preferences.theme).toBe('dark');
    // Absent keys mean "leave alone", not "reset".
    expect(res.body.user.preferences.routingMode).toBe('balanced');
  });
});

describe('CSRF', () => {
  it('rejects a mutating request without the client header', async () => {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'x@example.com', password: 'correct-horse-battery' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a mutating request from a foreign origin', async () => {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: 'https://evil.example',
        'x-nexus-client': 'web',
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ email: 'x@example.com', password: 'correct-horse-battery' }),
    });
    expect(res.statusCode).toBe(401);
  });
});
