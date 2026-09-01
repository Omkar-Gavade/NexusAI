import type { FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from '../../domain/errors.ts';

interface Window {
  count: number;
  resetAt: number;
}

export interface LimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * Fixed-window counters, in process.
 *
 * Redis is not a dependency of this deployment (ADR-013), so these limits are
 * per-instance. With one instance that is exact; behind a load balancer the
 * effective limit multiplies by the instance count. Documented rather than
 * pretended away — the alternative is a second datastore for counters that a
 * single-instance deployment does not need.
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly now: () => number = Date.now) {}

  check(key: string, rule: LimitRule): void {
    const nowMs = this.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= nowMs) {
      this.windows.set(key, { count: 1, resetAt: nowMs + rule.windowMs });
      return;
    }

    existing.count += 1;
    if (existing.count > rule.limit) {
      throw Errors.rateLimited(Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)));
    }
  }

  /** Bounded memory: expired windows are dropped on a timer, not per request. */
  sweep(): void {
    const nowMs = this.now();
    for (const [key, window] of this.windows) {
      if (window.resetAt <= nowMs) this.windows.delete(key);
    }
  }

  reset(): void {
    this.windows.clear();
  }
}

export const RULES = {
  // Credential stuffing is the threat; five attempts per quarter hour is
  // generous for a human and useless for a script.
  authWrite: { limit: 5, windowMs: 15 * 60_000 },
  refresh: { limit: 30, windowMs: 15 * 60_000 },
  // Chat is the expensive one: each request can invoke several paid models
  // plus a synthesis pass.
  chat: { limit: 20, windowMs: 60_000 },
  read: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, LimitRule>;

export function createRateLimit(limiter: RateLimiter, rule: LimitRule, scope: string) {
  return async function rateLimit(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const identity = request.user?.id ?? request.ip;
    limiter.check(`${scope}:${identity}`, rule);
  };
}
