import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createHarness, type Harness } from '../fixtures/harness.ts';

/**
 * Security behaviour that only exists when NODE_ENV=production.
 *
 * These cannot be observed from a locally-running server: the production boot
 * guard refuses to start without a configured provider, and no credentials
 * exist here. Building the app in production mode with no provider exercises
 * the same code path for everything that does not need a model — which is
 * exactly the set of settings under test.
 */
let prod: Harness;

beforeAll(async () => {
  prod = await createHarness({ NODE_ENV: 'production', TEST_PROVIDER_ENABLED: 'false' });
});
afterAll(async () => {
  await prod.close();
});

const cookiesFrom = (headers: Record<string, unknown>) => {
  const raw = headers['set-cookie'];
  return (Array.isArray(raw) ? raw : [String(raw)]) as string[];
};

async function register(): Promise<string[]> {
  const client = new Client(prod.app);
  const res = await client.post('/api/auth/register', {
    email: `prod-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-sufficiently-long-password',
    displayName: 'Prod',
  });
  expect(res.status).toBe(201);
  return cookiesFrom(res.headers);
}

describe('production cookie flags', () => {
  it('marks both session cookies Secure and HttpOnly', async () => {
    const cookies = await register();
    const access = cookies.find((c) => c.startsWith('nx_at='))!;
    const refresh = cookies.find((c) => c.startsWith('nx_rt='))!;

    for (const cookie of [access, refresh]) {
      expect(cookie).toContain('HttpOnly');
      // Absent in development because localhost is not HTTPS; required here.
      expect(cookie).toContain('Secure');
    }
  });

  it('scopes the refresh cookie to the auth path with SameSite=Strict', async () => {
    const refresh = (await register()).find((c) => c.startsWith('nx_rt='))!;

    // Not sent on ordinary API calls, and not sent on cross-site navigation:
    // the refresh token is the credential worth protecting hardest.
    expect(refresh).toContain('Path=/api/auth');
    expect(refresh).toContain('SameSite=Strict');
  });

  it('leaves the access cookie site-wide but Lax', async () => {
    const access = (await register()).find((c) => c.startsWith('nx_at='))!;
    expect(access).toContain('Path=/');
    expect(access).toContain('SameSite=Lax');
  });
});

describe('production security headers', () => {
  it('sends HSTS with a one-year max-age and subdomains', async () => {
    const res = await new Client(prod.app).get('/health/live');
    const hsts = String(res.headers['strict-transport-security']);

    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
  });

  it('sets the header set that actually applies to a JSON and SSE API', async () => {
    const res = await new Client(prod.app).get('/health/live');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    // This API never serves HTML, so a document CSP would govern nothing.
    // The frontend ships its own.
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('does not disclose the server implementation', async () => {
    const res = await new Client(prod.app).get('/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('production provider posture', () => {
  it('reports no routable model rather than falling back to the test adapter', () => {
    // main.ts turns this into a non-zero exit. The registry-level fact is what
    // makes that guard correct.
    expect(prod.container.testAdapter).toBeNull();
    expect(prod.container.registry.routable()).toHaveLength(0);
    expect(prod.container.registry.autoAvailable()).toBe(false);
  });

  it('keeps test-only models out of the catalog entirely', () => {
    const wire = prod.container.registry.toWire();
    expect(wire.some((m) => m.id.startsWith('test-'))).toBe(false);
    // And every real model is honestly reported as unconfigured.
    expect(wire.every((m) => m.availability === 'NOT_CONFIGURED')).toBe(true);
  });

  it('does not reveal provider configuration on the unauthenticated readiness probe', async () => {
    const res = await new Client(prod.app).get('/health/ready');
    const body = JSON.stringify(res.body);

    for (const leak of ['openai', 'anthropic', 'gemini', 'apiKey', 'API_KEY']) {
      expect(body.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });
});
