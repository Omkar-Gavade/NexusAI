import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../fixtures/harness.ts';
import { ACCESS_COOKIE } from '../../src/api/middleware/authenticate.ts';

/**
 * The browser-facing boundary: which origins may make credentialed calls, and
 * which access tokens are believed. Configured the way production is — the
 * deployed site plus a second allowed origin (a preview, say).
 */
const SITE = 'https://app.example.com';
const PREVIEW = 'https://preview.example.com';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness({ WEB_ORIGIN: `${SITE},${PREVIEW}` });
});
afterAll(async () => {
  await harness.close();
});
beforeEach(() => {
  harness.container.limiter.reset();
});

/** A no-op mutation: logout without a session changes nothing and returns 204. */
function logout(headers: Record<string, string>) {
  return harness.app.inject({ method: 'POST', url: '/api/auth/logout', headers });
}

function preflight(origin: string) {
  return harness.app.inject({
    method: 'OPTIONS',
    url: '/api/auth/login',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-nexus-client',
    },
  });
}

describe('Origin check on mutating requests', () => {
  it('accepts every configured origin', async () => {
    for (const origin of [SITE, PREVIEW]) {
      const res = await logout({ origin, 'x-nexus-client': 'web' });
      expect(res.statusCode, origin).toBe(204);
    }
  });

  it.each([
    ['a foreign site', 'https://evil.example'],
    ['a look-alike that contains the real origin', 'https://app.example.com.evil.example'],
    ['the real host on another scheme', 'http://app.example.com'],
    ['the real host on another port', 'https://app.example.com:8443'],
    ['an opaque origin', 'null'],
    ['a malformed value', 'not a url'],
  ])('rejects %s with ORIGIN_NOT_ALLOWED', async (_label, origin) => {
    const res = await logout({ origin, 'x-nexus-client': 'web' });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('falls back to the Referer origin when Origin is absent', async () => {
    const ok = await logout({ referer: `${SITE}/app/chat`, 'x-nexus-client': 'web' });
    expect(ok.statusCode).toBe(204);

    const foreign = await logout({ referer: 'https://evil.example/page', 'x-nexus-client': 'web' });
    expect(foreign.statusCode).toBe(403);
  });

  it('rejects a mutating request with neither Origin nor Referer', async () => {
    // The API serves this app's browser client only. A request that names no
    // origin at all is refused rather than trusted.
    const res = await logout({ 'x-nexus-client': 'web' });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('does not apply to reads', async () => {
    const res = await harness.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { origin: 'https://evil.example' },
    });
    // Signed out, not refused for its origin: GETs change nothing, and CORS
    // keeps the response from a foreign page.
    expect(JSON.parse(res.body).error.code).toBe('UNAUTHENTICATED');
  });
});

describe('CORS preflight', () => {
  it('allows each configured origin, with credentials, and only the headers the client sends', async () => {
    for (const origin of [SITE, PREVIEW]) {
      const res = await preflight(origin);
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain(
        'x-nexus-client',
      );
    }
  });

  it.each(['https://evil.example', 'https://app.example.com.evil.example', 'null'])(
    'grants nothing to %s — no wildcard, no reflection',
    async (origin) => {
      const res = await preflight(origin);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    },
  );
});

describe('access tokens', () => {
  async function meWith(token: string) {
    const res = await harness.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    });
    return { status: res.statusCode, code: JSON.parse(res.body).error?.code as string | undefined };
  }

  /** Registers from the configured site (the shared Client sends localhost). */
  async function signedIn(): Promise<{ token: string; userId: string }> {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: SITE, 'x-nexus-client': 'web', 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: `tokens-${randomUUID().slice(0, 8)}@example.com`,
        password: 'correct-horse-battery',
        displayName: 'Tokens',
      }),
    });
    expect(res.statusCode).toBe(201);
    const cookies = ([] as string[]).concat((res.headers['set-cookie'] as string[] | string) ?? []);
    const access = cookies.find((h) => h.startsWith(`${ACCESS_COOKIE}=`))!;
    return {
      token: access.slice(ACCESS_COOKIE.length + 1).split(';')[0]!,
      userId: JSON.parse(res.body).user.id as string,
    };
  }

  it('accepts the token it issued', async () => {
    const { token } = await signedIn();
    expect((await meWith(token)).status).toBe(200);
  });

  it('rejects a token whose payload was edited', async () => {
    const { token } = await signedIn();
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    const edited = Buffer.from(JSON.stringify({ ...claims, sub: '000000000000000000000000' })).toString(
      'base64url',
    );
    expect(await meWith(`${header}.${edited}.${signature}`)).toEqual({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects an unsigned token (alg: none)', async () => {
    const { userId } = await signedIn();
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({
      sub: userId,
      sid: 'x',
      iss: 'nexusai',
      aud: 'nexusai-web',
      iat: now,
      exp: now + 600,
    })}.`;
    expect(await meWith(unsigned)).toEqual({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('rejects a well-formed token signed by any other key — the forged-token case', async () => {
    const { userId } = await signedIn();
    const { privateKey } = generateKeyPairSync('ed25519');
    const forged = await new SignJWT({ sid: 'x' })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(userId)
      .setIssuer('nexusai')
      .setAudience('nexusai-web')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);
    expect(await meWith(forged)).toEqual({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('rejects garbage without leaking why', async () => {
    const res = await meWith('not-a-jwt');
    expect(res).toEqual({ status: 401, code: 'UNAUTHENTICATED' });
  });
});
