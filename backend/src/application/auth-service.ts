import { randomUUID } from 'node:crypto';
import type { UpdateProfileRequest, User, UserPreferences } from '@nexusai/contracts';
import type { Config } from '../config/env.ts';
import { Errors } from '../domain/errors.ts';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../domain/auth/password.ts';
import type { TokenService } from '../domain/auth/tokens.ts';
import type { SessionRepository } from '../infrastructure/repositories/session-repository.ts';
import { ROTATION_GRACE_MS } from '../infrastructure/repositories/session-repository.ts';
import type { UserRepository } from '../infrastructure/repositories/user-repository.ts';
import type { UserDoc } from '../infrastructure/repositories/types.ts';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  routingMode: 'balanced',
  pinnedModelId: null,
};

export class AuthService {
  constructor(
    private readonly deps: {
      config: Config;
      users: UserRepository;
      sessions: SessionRepository;
      tokens: TokenService;
    },
  ) {}

  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ user: User; session: IssuedSession }> {
    const email = input.email.trim().toLowerCase();

    if (await this.deps.users.findByEmail(email)) throw Errors.emailTaken();

    const user = await this.deps.users.create({
      email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName.trim(),
      preferences: DEFAULT_PREFERENCES,
    });

    return { user: toWire(user), session: await this.issue(user._id.toHexString()) };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: User; session: IssuedSession }> {
    const user = await this.deps.users.findByEmail(input.email.trim().toLowerCase());

    // An unknown email still burns an Argon2 verification. Without it the two
    // failure modes differ by ~50ms, which is a usable enumeration oracle.
    if (!user) {
      await verifyAgainstDummy(input.password);
      throw Errors.invalidCredentials();
    }

    if (!(await verifyPassword(user.passwordHash, input.password))) {
      throw Errors.invalidCredentials();
    }

    return { user: toWire(user), session: await this.issue(user._id.toHexString()) };
  }

  /**
   * Rotation with reuse detection.
   *
   * A rotated token stays usable for a grace window because two tabs can
   * legitimately refresh at once; without it, ordinary use would trip the
   * detector and sign people out. Presenting a rotated token after that window
   * means it leaked, so the whole family dies.
   */
  async refresh(refreshToken: string): Promise<IssuedSession> {
    const tokenHash = this.deps.tokens.hashRefreshToken(refreshToken);
    const session = await this.deps.sessions.findByTokenHash(tokenHash);

    if (!session) throw Errors.sessionExpired();
    if (session.expiresAt.getTime() < Date.now()) throw Errors.sessionExpired();

    if (session.rotatedAt) {
      if (Date.now() - session.rotatedAt.getTime() > ROTATION_GRACE_MS) {
        await this.deps.sessions.revokeFamily(session.familyId);
        throw Errors.sessionRevoked();
      }
      // Inside the grace window: a concurrent tab, not an attacker.
    }

    await this.deps.sessions.markRotated(tokenHash);
    return this.issue(session.userId.toHexString(), session.familyId);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = this.deps.tokens.hashRefreshToken(refreshToken);
    const session = await this.deps.sessions.findByTokenHash(tokenHash);
    // Revoke the family, not just this token: signing out should end the
    // session, not one link in its chain.
    if (session) await this.deps.sessions.revokeFamily(session.familyId);
  }

  async currentUser(userId: string): Promise<User> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw Errors.unauthenticated();
    return toWire(user);
  }

  /** Takes the contract type directly, so the service and the wire cannot drift. */
  async updateProfile(userId: string, patch: UpdateProfileRequest): Promise<User> {
    const current = await this.deps.users.findById(userId);
    if (!current) throw Errors.unauthenticated();

    const updated = await this.deps.users.update(userId, {
      ...(patch.displayName === undefined ? {} : { displayName: patch.displayName.trim() }),
      ...(patch.preferences === undefined
        ? {}
        : { preferences: mergePreferences(current.preferences, patch.preferences) }),
    });

    if (!updated) throw Errors.unauthenticated();
    return toWire(updated);
  }

  private async issue(userId: string, familyId: string = randomUUID()): Promise<IssuedSession> {
    const { token, tokenHash } = this.deps.tokens.mintRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.deps.config.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );

    const session = await this.deps.sessions.create({
      userId,
      tokenHash,
      familyId,
      expiresAt: refreshExpiresAt,
    });

    return {
      accessToken: await this.deps.tokens.signAccessToken({
        userId,
        sessionId: session._id.toHexString(),
      }),
      refreshToken: token,
      refreshExpiresAt,
    };
  }
}

/**
 * An absent key means "leave it alone". Spreading the patch directly would
 * write `undefined` over a set preference, silently resetting it.
 */
function mergePreferences(
  current: UserPreferences,
  patch: NonNullable<UpdateProfileRequest['preferences']>,
): UserPreferences {
  return {
    theme: patch.theme ?? current.theme,
    routingMode: patch.routingMode ?? current.routingMode,
    pinnedModelId:
      patch.pinnedModelId === undefined ? current.pinnedModelId : patch.pinnedModelId,
  };
}

/** Never returns passwordHash. The wire type has no field for it. */
function toWire(user: UserDoc): User {
  return {
    id: user._id.toHexString(),
    email: user.email,
    displayName: user.displayName,
    preferences: user.preferences,
    createdAt: user.createdAt.toISOString(),
  };
}
