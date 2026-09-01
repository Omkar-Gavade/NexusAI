import { hash, verify } from '@node-rs/argon2';

/**
 * OWASP baseline for Argon2id. Raising these is safe — every hash encodes the
 * parameters it was made with, so old hashes keep verifying — but lowering them
 * silently weakens every password created afterwards.
 */
const PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/**
 * A real hash of a throwaway value, verified against when the email is unknown.
 * Without it, "no such user" returns in microseconds and "wrong password" takes
 * ~50ms, which is a usable account-enumeration oracle.
 */
let dummyHash: string | null = null;

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, PARAMS);
}

export async function verifyPassword(passwordHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plaintext);
  } catch {
    // A malformed stored hash must read as "wrong password", not as a crash.
    return false;
  }
}

/** Burns the same CPU as a real verification. Always returns false. */
export async function verifyAgainstDummy(plaintext: string): Promise<false> {
  dummyHash ??= await hash('nexusai-timing-equaliser', PARAMS);
  await verify(dummyHash, plaintext).catch(() => false);
  return false;
}
