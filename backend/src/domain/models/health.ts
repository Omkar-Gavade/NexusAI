import type { Availability } from '@nexusai/contracts';

const OPEN_COOLDOWN_MS = 60_000;
const FAILURES_BEFORE_OPEN = 3;

/**
 * How long a rejected credential is believed before one call is allowed
 * through to re-check it. Much longer than the outage cooldown, because
 * retrying a key that is genuinely wrong is pure noise — but not infinite,
 * because a key can be rotated, un-revoked or unsuspended without anyone
 * restarting this process, and a single spurious 401 during a provider
 * incident must not disable that provider until someone notices.
 */
const AUTH_COOLDOWN_MS = 15 * 60_000;

interface ProviderHealth {
  consecutiveFailures: number;
  openedAt: number | null;
  lastSuccessAt: number | null;
  /** When a credential was last rejected. Needs an operator, not a retry loop. */
  authFailedAt: number | null;
}

/**
 * Availability derived from what actually happened.
 *
 * There is no background prober and no synthetic health check: real traffic is
 * the probe. A provider starts UNKNOWN — configured but unverified, which is
 * the honest state before anything has been asked of it — and reaches AVAILABLE
 * only once a call has genuinely succeeded.
 *
 * In-process, so it is per-instance. With one instance that is exact; across
 * several, each learns independently. Recorded in ADR-013.
 */
export class ProviderHealthTracker {
  private readonly health = new Map<string, ProviderHealth>();

  private entry(provider: string): ProviderHealth {
    let found = this.health.get(provider);
    if (!found) {
      found = { consecutiveFailures: 0, openedAt: null, lastSuccessAt: null, authFailedAt: null };
      this.health.set(provider, found);
    }
    return found;
  }

  recordSuccess(provider: string): void {
    const entry = this.entry(provider);
    entry.consecutiveFailures = 0;
    entry.openedAt = null;
    entry.authFailedAt = null;
    entry.lastSuccessAt = Date.now();
  }

  /**
   * `affectsHealth` is false for failures that say nothing about the provider —
   * a content-policy refusal or a cancelled request is not an outage.
   *
   * A rejected credential is deliberately not subject to that gate. Callers
   * derive `affectsHealth` from whether the failure looks transient, and an
   * auth failure is the least transient thing there is, so gating on it meant
   * `authFailed` could never be set: a server with a wrong key kept reporting
   * the model as selectable and kept calling the provider on every turn.
   */
  recordFailure(provider: string, options: { affectsHealth: boolean; isAuthError: boolean }): void {
    if (options.isAuthError) {
      this.entry(provider).authFailedAt = Date.now();
      return;
    }
    if (!options.affectsHealth) return;
    const entry = this.entry(provider);
    entry.consecutiveFailures += 1;
    if (entry.consecutiveFailures >= FAILURES_BEFORE_OPEN) entry.openedAt = Date.now();
  }

  availability(provider: string, configured: boolean, now = Date.now()): Availability {
    if (!configured) return 'NOT_CONFIGURED';

    const entry = this.health.get(provider);
    if (!entry) return 'UNKNOWN';

    // Credentials were rejected. Reported as such until the cooldown elapses,
    // then one call is allowed through to re-establish the truth — otherwise a
    // fixed key would never be noticed without a restart.
    if (entry.authFailedAt !== null) {
      if (now - entry.authFailedAt < AUTH_COOLDOWN_MS) return 'CONFIGURED_BUT_UNAVAILABLE';
      return 'UNKNOWN';
    }

    if (entry.openedAt !== null) {
      if (now - entry.openedAt < OPEN_COOLDOWN_MS) return 'TEMPORARILY_UNAVAILABLE';
      // Cooldown elapsed: let one request through to re-establish the truth.
      return 'UNKNOWN';
    }

    return entry.lastSuccessAt === null ? 'UNKNOWN' : 'AVAILABLE';
  }

  reason(availability: Availability): string | null {
    switch (availability) {
      case 'NOT_CONFIGURED':
        return 'No API key configured on this server.';
      case 'CONFIGURED_BUT_UNAVAILABLE':
        return 'The configured credentials were rejected.';
      case 'TEMPORARILY_UNAVAILABLE':
        return 'Recent requests to this provider failed.';
      case 'DEPRECATED':
        return 'This model is no longer supported.';
      case 'DISABLED':
        return 'Disabled on this server.';
      default:
        return null;
    }
  }

  reset(): void {
    this.health.clear();
  }
}
