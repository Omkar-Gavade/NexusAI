import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.ts';
import { Client, createHarness, type Harness } from '../fixtures/harness.ts';

const BASE = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  JWT_PRIVATE_KEY: 'x',
  JWT_PUBLIC_KEY: 'y',
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

let harness: Harness | null = null;
afterEach(async () => {
  await harness?.close();
  harness = null;
});

/**
 * Rate limits for unauthenticated traffic are keyed on `request.ip`, so whether
 * `X-Forwarded-For` is believed decides whether those limits can be bypassed.
 *
 * The setting fails closed. Previously it was `NODE_ENV === 'production'`,
 * which trusted the header from any source: a directly reachable deployment
 * could have its registration and login limits defeated by a client that set
 * its own forwarding header.
 */
describe('TRUST_PROXY parsing', () => {
  it('defaults to trusting nothing', () => {
    expect(loadConfig(BASE).TRUST_PROXY).toBe(false);
  });

  it('reads a hop count', () => {
    expect(loadConfig({ ...BASE, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
  });

  it('reads an address or CIDR allowlist', () => {
    expect(loadConfig({ ...BASE, TRUST_PROXY: '10.0.0.0/8, 127.0.0.1' }).TRUST_PROXY).toEqual([
      '10.0.0.0/8',
      '127.0.0.1',
    ]);
  });

  it('treats an empty value as trusting nothing rather than everything', () => {
    expect(loadConfig({ ...BASE, TRUST_PROXY: '' }).TRUST_PROXY).toBe(false);
  });
});

describe('rate-limit identity under a forged forwarding header', () => {
  async function exhaustLogins(client: Client): Promise<number> {
    let status = 0;
    for (let i = 0; i < 8 && status !== 429; i += 1) {
      status = (
        await client.post('/api/auth/login', {
          email: 'nobody@example.test',
          password: 'wrong-password-here',
        })
      ).status;
    }
    return status;
  }

  it('ignores X-Forwarded-For when the proxy is not trusted', async () => {
    harness = await createHarness({ TRUST_PROXY: 'false' });
    const client = new Client(harness.app);

    expect(await exhaustLogins(client)).toBe(429);

    // A rotated forwarding header must not buy a fresh bucket.
    const evasive = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        'x-nexus-client': 'web',
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.99',
      },
      payload: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-password-here' }),
    });

    expect(evasive.statusCode).toBe(429);
  }, 60_000);

  it('honours X-Forwarded-For when a proxy hop is trusted', async () => {
    harness = await createHarness({ TRUST_PROXY: '1' });
    const client = new Client(harness.app);

    expect(await exhaustLogins(client)).toBe(429);

    // A genuinely different client behind the same proxy is not punished for
    // its neighbour's traffic — the reason to trust the header at all.
    const other = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        'x-nexus-client': 'web',
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.42',
      },
      payload: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-password-here' }),
    });

    expect(other.statusCode).toBe(401);
  }, 60_000);
});
