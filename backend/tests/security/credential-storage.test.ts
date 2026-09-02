import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD_MIN } from '@nexusai/contracts';
import { Client, createHarness, type Harness } from '../fixtures/harness.ts';
import { loggerOptions } from '../../src/infrastructure/observability/logger.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

// Registration is IP rate-limited, and every case here registers. The limit is
// the subject of its own suite; here it would only mask what is being tested.
beforeEach(() => {
  h.container.limiter.reset();
});

/** A password that is only ever compared against, never asserted as a literal. */
const SECRET = 'correct-horse-battery-staple';

async function registerFresh(password = SECRET) {
  const email = `store-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const client = new Client(h.app);
  const res = await client.post('/api/auth/register', {
    email,
    password,
    displayName: 'Storage',
  });
  return { client, email, res };
}

/**
 * What reaches the database, and what leaves the process.
 *
 * Asserted against the stored document rather than the hashing function,
 * because the question is not "does the code call Argon2" but "is the password
 * recoverable from what was written". Those come apart the moment someone adds
 * a field.
 */
describe('credential storage', () => {
  it('writes a user document with no recoverable password', async () => {
    const { email, res } = await registerFresh();
    expect(res.status).toBe(201);

    const stored = await h.db.collection('users').findOne({ email });
    expect(stored).not.toBeNull();

    const serialised = JSON.stringify(stored);
    // The exact string, and the obvious encodings of it.
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(Buffer.from(SECRET).toString('base64'));
    expect(serialised.toLowerCase()).not.toContain(SECRET.toLowerCase());
  });

  it('stores an Argon2id hash, not a reversible digest', async () => {
    const { email } = await registerFresh();
    const stored = await h.db.collection('users').findOne({ email });
    const hash = String((stored as { passwordHash?: string } | null)?.passwordHash);

    // PHC string format: the algorithm is recorded in the hash itself, so a
    // silent downgrade to a faster one is visible here.
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash.length).toBeGreaterThan(50);
  });

  it('salts, so identical passwords do not produce identical hashes', async () => {
    const one = await registerFresh();
    const two = await registerFresh();

    const hashFor = async (email: string) => {
      const doc = await h.db.collection('users').findOne({ email });
      return String((doc as { passwordHash?: string } | null)?.passwordHash);
    };

    expect(await hashFor(one.email)).not.toBe(await hashFor(two.email));
  });

  it('never returns password material from any authenticated endpoint', async () => {
    const { client } = await registerFresh();

    for (const path of ['/api/auth/me', '/api/conversations', '/api/models']) {
      const res = await client.get(path);
      const body = JSON.stringify(res.body);

      expect(body).not.toContain(SECRET);
      expect(body).not.toMatch(/passwordHash|argon2/i);
    }
  });

  it('does not echo the password in a validation failure', async () => {
    const res = await new Client(h.app).post('/api/auth/register', {
      email: 'not-an-email',
      password: SECRET,
      displayName: 'Echo',
    });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  // The minimum is a policy value; the hashing behind it is not weakened by it.
  it('hashes a minimum-length password exactly as strongly', async () => {
    const short = 'x'.repeat(PASSWORD_MIN);
    const { email, res } = await registerFresh(short);
    expect(res.status).toBe(201);

    const stored = await h.db.collection('users').findOne({ email });
    const hash = String((stored as { passwordHash?: string } | null)?.passwordHash);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(stored)).not.toContain(short);
  });
});

describe('the change-password fields cannot reach a log', () => {
  it('redacts both password fields by their real names', () => {
    // pino matches exact keys, so `*.password` does not cover
    // `currentPassword`. Nothing in the auth path logs a body today; this is
    // what stops a future logger call from leaking one.
    const { redact } = loggerOptions(h.container.config);
    const paths = (redact as { paths: string[] }).paths;

    for (const key of ['currentPassword', '*.currentPassword', 'newPassword', '*.newPassword']) {
      expect(paths).toContain(key);
    }
    // The pre-existing ones must survive the addition.
    expect(paths).toContain('passwordHash');
    expect(paths).toContain('req.headers.authorization');
  });
});
