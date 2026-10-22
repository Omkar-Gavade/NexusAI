import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.ts';
import {
  COMPROMISED_KEY_FINGERPRINTS,
  createTokenService,
  publicKeyFingerprint,
} from '../../src/domain/auth/tokens.ts';
import { isAppError } from '../../src/domain/errors.ts';

/**
 * Key handling for access tokens: which keys the server will sign with, and
 * how a token from a rotated-out key is answered.
 */
function keypair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function config(pair: ReturnType<typeof keypair>, extra: Record<string, string> = {}) {
  return loadConfig({
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    JWT_PRIVATE_KEY: pair.privatePem,
    JWT_PUBLIC_KEY: pair.publicPem,
    ...extra,
  } as NodeJS.ProcessEnv);
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : `non-app error: ${String(error)}`;
  }
  return 'resolved';
}

const claims = { userId: '64b7f0c2a1b2c3d4e5f60718', sessionId: '64b7f0c2a1b2c3d4e5f60719' };

describe('signing keys', () => {
  it('signs and verifies with a matching keypair', async () => {
    const tokens = await createTokenService(config(keypair()));
    const token = await tokens.signAccessToken(claims);
    await expect(tokens.verifyAccessToken(token)).resolves.toEqual(claims);
  });

  it('refuses to start with a key on the compromised list, without printing it', async () => {
    const pair = keypair();
    const fingerprint = publicKeyFingerprint(createPublicKey(pair.publicPem));

    const failure = createTokenService(config(pair), { compromised: new Set([fingerprint]) });

    await expect(failure).rejects.toThrow(/publicly known/);
    const message = await failure.catch((error: Error) => error.message);
    expect(message).not.toContain('BEGIN');
    expect(message).not.toContain(fingerprint);
  });

  it('lists the key that was committed to the repository history', () => {
    // The value itself is checked by hand against the commit; this guards the
    // entry from being dropped by accident.
    expect(COMPROMISED_KEY_FINGERPRINTS.size).toBeGreaterThanOrEqual(1);
    for (const fingerprint of COMPROMISED_KEY_FINGERPRINTS) {
      expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('refuses a private and public key from different pairs', async () => {
    const a = keypair();
    const b = keypair();
    await expect(
      createTokenService(config({ privatePem: a.privatePem, publicPem: b.publicPem })),
    ).rejects.toThrow(/not the same keypair/);
  });
});

describe('rotation: retired keys', () => {
  it('answers a token from a retired key as expired, so the client refreshes, and never accepts it', async () => {
    const before = keypair();
    const after = keypair();
    const oldToken = await (await createTokenService(config(before))).signAccessToken(claims);

    const rotated = await createTokenService(
      config(after, { JWT_RETIRED_PUBLIC_KEYS: before.publicPem }),
    );

    expect(await errorCode(rotated.verifyAccessToken(oldToken))).toBe('TOKEN_EXPIRED');
    // And the new key works as normal.
    const fresh = await rotated.signAccessToken(claims);
    await expect(rotated.verifyAccessToken(fresh)).resolves.toEqual(claims);
  });

  it('without a retired key listed, a token from another key is simply invalid', async () => {
    const before = keypair();
    const oldToken = await (await createTokenService(config(before))).signAccessToken(claims);
    const rotated = await createTokenService(config(keypair()));

    expect(await errorCode(rotated.verifyAccessToken(oldToken))).toBe('UNAUTHENTICATED');
  });

  it('does not extend the retired treatment to unrelated keys', async () => {
    const retired = keypair();
    const stranger = keypair();
    const forged = await (await createTokenService(config(stranger))).signAccessToken(claims);
    const tokens = await createTokenService(
      config(keypair(), { JWT_RETIRED_PUBLIC_KEYS: retired.publicPem }),
    );

    expect(await errorCode(tokens.verifyAccessToken(forged))).toBe('UNAUTHENTICATED');
  });

  it('reads several retired keys from one variable, with escaped newlines', () => {
    const a = keypair();
    const b = keypair();
    const escaped = (a.publicPem + b.publicPem).replace(/\n/g, '\\n');
    const parsed = config(keypair(), { JWT_RETIRED_PUBLIC_KEYS: escaped }).JWT_RETIRED_PUBLIC_KEYS;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toContain('BEGIN PUBLIC KEY');
  });

  it('defaults to no retired keys', () => {
    expect(config(keypair()).JWT_RETIRED_PUBLIC_KEYS).toEqual([]);
  });
});
