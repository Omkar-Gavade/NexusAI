import { createHash, createPrivateKey, createPublicKey, randomBytes, type KeyObject } from 'node:crypto';
import { importPKCS8, importSPKI, jwtVerify, SignJWT, type KeyLike } from 'jose';
import type { Config } from '../../config/env.ts';
import { Errors } from '../errors.ts';

const ALG = 'EdDSA';

/**
 * Signing keys that are public knowledge, by the SHA-256 of their public key
 * (DER SubjectPublicKeyInfo). Anyone holding one of these private keys can
 * mint an access token for any user, so the server refuses to start with one.
 * A fingerprint identifies a key without containing it.
 */
export const COMPROMISED_KEY_FINGERPRINTS: ReadonlySet<string> = new Set([
  // Committed to the public repository in bc853ff, as
  // backend/.env.backup-1787934214, and still reachable in its history.
  '209ba786e6d7670cb94091e3139412761c799b4560d2cec774c49ec807075b13',
]);

/** SHA-256 of the DER SubjectPublicKeyInfo: a stable, non-secret key id. */
export function publicKeyFingerprint(key: KeyObject): string {
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

export interface TokenService {
  signAccessToken(claims: AccessClaims): Promise<string>;
  /** Throws TOKEN_EXPIRED on expiry, UNAUTHENTICATED on anything else. */
  verifyAccessToken(token: string): Promise<AccessClaims>;
  mintRefreshToken(): { token: string; tokenHash: string };
  hashRefreshToken(token: string): string;
}

/**
 * The access token is stateless so it can be verified on every request without
 * a database read. The refresh token is opaque and stored, because it must be
 * *revocable* — which a stateless token fundamentally is not. Using the right
 * mechanism for each job avoids the usual mistake of a long-lived stateless
 * token that cannot be invalidated.
 */
export async function createTokenService(
  config: Config,
  options: { compromised?: ReadonlySet<string> } = {},
): Promise<TokenService> {
  const compromised = options.compromised ?? COMPROMISED_KEY_FINGERPRINTS;
  let privateKey: KeyLike;
  let publicKey: KeyLike;
  let retiredKeys: KeyLike[];
  let signingFingerprint: string;
  let verifyingFingerprint: string;

  try {
    privateKey = await importPKCS8(config.JWT_PRIVATE_KEY, ALG);
    publicKey = await importSPKI(config.JWT_PUBLIC_KEY, ALG);
    signingFingerprint = publicKeyFingerprint(createPublicKey(createPrivateKey(config.JWT_PRIVATE_KEY)));
    verifyingFingerprint = publicKeyFingerprint(createPublicKey(config.JWT_PUBLIC_KEY));
  } catch (cause) {
    throw new Error(
      'JWT_PRIVATE_KEY / JWT_PUBLIC_KEY must be a PEM Ed25519 keypair. Run `pnpm backend:keys`.',
      { cause },
    );
  }

  // Two halves of different pairs would sign tokens this server then rejects:
  // every sign-in would "succeed" and every request after it would fail.
  if (signingFingerprint !== verifyingFingerprint) {
    throw new Error(
      'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are not the same keypair. Set both from one `pnpm backend:keys` run.',
    );
  }

  // Never names or prints the key: the fingerprint list is enough to act on.
  if (compromised.has(signingFingerprint)) {
    throw new Error(
      'The configured JWT signing key is publicly known (it is in the repository history) and must be replaced. ' +
        'Generate a new keypair with `pnpm backend:keys` and follow "Rotating the JWT keys" in docs/backend/deployment.md.',
    );
  }

  try {
    retiredKeys = await Promise.all(config.JWT_RETIRED_PUBLIC_KEYS.map((pem) => importSPKI(pem, ALG)));
  } catch (cause) {
    throw new Error('JWT_RETIRED_PUBLIC_KEYS must contain PEM Ed25519 public keys.', { cause });
  }

  /**
   * True when the token was signed by a key that has been rotated out. Such a
   * token is never trusted — nothing from it is returned — but it is reported
   * as expired, so the client refreshes rather than signing its user out.
   */
  async function signedByRetiredKey(token: string): Promise<boolean> {
    for (const key of retiredKeys) {
      try {
        await jwtVerify(token, key, {
          issuer: config.JWT_ISSUER,
          audience: config.JWT_AUDIENCE,
          algorithms: [ALG],
        });
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === 'JWTExpired') return true;
      }
    }
    return false;
  }

  return {
    async signAccessToken(claims) {
      return new SignJWT({ sid: claims.sessionId })
        .setProtectedHeader({ alg: ALG })
        .setSubject(claims.userId)
        .setIssuer(config.JWT_ISSUER)
        .setAudience(config.JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
        .sign(privateKey);
    },

    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, publicKey, {
          issuer: config.JWT_ISSUER,
          audience: config.JWT_AUDIENCE,
          algorithms: [ALG],
        });
        if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
          throw Errors.unauthenticated();
        }
        return { userId: payload.sub, sessionId: payload.sid };
      } catch (error) {
        // The distinction the whole client session lifecycle depends on: the
        // frontend refreshes on TOKEN_EXPIRED and signs out on UNAUTHENTICATED.
        if (error instanceof Error && error.name === 'JWTExpired') throw Errors.tokenExpired();
        if (
          error instanceof Error &&
          (error as { code?: unknown }).code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' &&
          (await signedByRetiredKey(token))
        ) {
          throw Errors.tokenExpired();
        }
        throw Errors.unauthenticated();
      }
    },

    mintRefreshToken() {
      const token = randomBytes(32).toString('base64url');
      return { token, tokenHash: sha256(token) };
    },

    hashRefreshToken: sha256,
  };
}

/** Stored hashed, so a database dump does not yield usable tokens. */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
