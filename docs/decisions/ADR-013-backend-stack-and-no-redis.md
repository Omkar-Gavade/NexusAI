# ADR-013 — Backend stack, and dropping Redis for v1

Status: **Accepted** · 2026-08-28

## Context

`docs/backend/architecture.md` specified Node + TypeScript + Fastify + MongoDB +
Redis + Pino + Zod. That document was a design, not a description — no backend
existed. Before implementing, the environment was checked:

| Dependency | Available |
|---|---|
| MongoDB 8.0 | yes, running locally |
| Redis | **not installed** |
| Docker daemon | not running |
| Provider API keys | **none** |

## Decision

**Keep the documented stack, minus Redis.**

Node 22 · TypeScript · Fastify 5 · MongoDB 8 · Pino · Zod · Vitest. Argon2id via
`@node-rs/argon2` (verified working on this platform before anything depended on
it). Ed25519 JWTs via `jose`.

Redis was specified for five things. Each is relocated:

| Concern | Was | Now |
|---|---|---|
| Refresh sessions | Redis key + TTL | `sessions` collection with a TTL index |
| Rate limits | Redis counters | In-process fixed windows |
| Idempotency | Redis key | Unique partial index on `(userId, clientMessageId)` |
| Provider health | Redis hash | In-process, derived from real call outcomes |
| Circuit breaker | Redis hash | Same tracker |

Sessions are the case that mattered: they must be **revocable and durable**, and
Mongo's TTL monitor provides expiry natively. The rest are coordination state
that a single instance holds correctly.

## Alternatives considered

- **Install Redis anyway.** It would be a second datastore serving one
  collection's worth of data plus counters. The project's own guidance rejects
  infrastructure that is not yet earning its place.
- **Sessions as stateless JWTs.** Removes revocation entirely, which defeats
  logout and reuse detection.
- **Postgres instead of Mongo.** The documented choice is Mongo, it is installed,
  and the data is an append-mostly message log with no relational integrity
  requirement.

## Consequences

- **Rate limits and health are per-instance.** With one instance that is exact.
  Behind a load balancer the effective limit multiplies by instance count and
  each instance learns provider health independently. Documented in the limiter
  and the health tracker, not papered over.
- **Restoring Redis is a repository swap**, not a redesign: the session repo,
  the limiter and the health tracker are each one class behind one interface.
- **No migration framework.** Mongo schema management here is index creation,
  which is idempotent and runs at boot. A non-idempotent change — a backfill, a
  rename — gets a numbered script under `backend/migrations/` and is run
  explicitly.
- **No transactions.** Writes are ordered so that no multi-document atomicity is
  required, which also satisfies the rule that a database transaction is never
  held open across a provider call.

## Provider keys

None are configured. The registry reports `NOT_CONFIGURED` per provider and
`auto.available` reflects reality. Consequently **no real-provider E2E has been
performed**, and none is claimed.
