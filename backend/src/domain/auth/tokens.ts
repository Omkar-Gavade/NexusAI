import { createHash, randomBytes } from 'node:crypto';
import { importPKCS8, importSPKI, jwtVerify, SignJWT, type KeyLike } from 'jose';
import type { Config } from '../../config/env.ts';
import { Errors } from '../errors.ts';

const ALG = 'EdDSA';

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
export async function createTokenService(config: Config): Promise<TokenService> {
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  try {
    privateKey = await importPKCS8(config.JWT_PRIVATE_KEY, ALG);
    publicKey = await importSPKI(config.JWT_PUBLIC_KEY, ALG);
  } catch (cause) {
    throw new Error(
      'JWT_PRIVATE_KEY / JWT_PUBLIC_KEY must be a PEM Ed25519 keypair. Run `pnpm backend:keys`.',
      { cause },
    );
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
