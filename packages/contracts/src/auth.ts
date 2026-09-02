import { z } from 'zod';

export const ThemePreference = z.enum(['dark', 'light', 'system']);
export type ThemePreference = z.infer<typeof ThemePreference>;

/** How many models a request fans out to. Named by intent, not by count. */
export const RoutingMode = z.enum(['single', 'balanced', 'thorough']);
export type RoutingMode = z.infer<typeof RoutingMode>;

export const UserPreferences = z.object({
  theme: ThemePreference,
  routingMode: RoutingMode,
  pinnedModelId: z.string().nullable(),
});
export type UserPreferences = z.infer<typeof UserPreferences>;

export const User = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  preferences: UserPreferences,
  createdAt: z.string(),
});
export type User = z.infer<typeof User>;

export const SessionResponse = z.object({ user: User });
export type SessionResponse = z.infer<typeof SessionResponse>;

/**
 * Minimum password length, and the only password rule the product enforces.
 *
 * Lowered from 12 to 4 as a product decision. Length is still the property that
 * matters — composition rules like "one symbol, one digit" push people toward
 * `Passw0rd!`, which satisfies every class requirement and is weaker than a
 * longer passphrase — so no composition rule is added to compensate.
 *
 * This is a policy change, not a security one. Hashing is unchanged: Argon2id
 * at OWASP parameters, verified in constant time, with the unknown-email path
 * still burning a verification so the two failure modes cannot be told apart.
 *
 * Defined once and consumed by both sides. `LoginRequest` deliberately does not
 * apply it: existing accounts predate any change to the rule, and enforcing a
 * registration minimum at sign-in would leak the policy to an attacker.
 */
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 128;

export const RegisterRequest = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  displayName: z.string().trim().min(1).max(60),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/**
 * Changing a password.
 *
 * The confirmation field is deliberately absent: it exists to catch a typo
 * while typing and is a property of the form, not of the request. Sending it
 * would put a third copy of the new password on the wire for the server to
 * compare against itself.
 */
export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

export const UpdateProfileRequest = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  preferences: UserPreferences.partial().optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;
