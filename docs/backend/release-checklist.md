# Release Checklist

Status: **CURRENT** · Updated 2026-08-28

Operational, not aspirational. Every command here is one that exists in this
repository. Run them from the repository root unless stated otherwise.

Anything you cannot tick is a reason to stop, not a reason to note an exception.

## 0. Before any deployment — outstanding

- [ ] **Rotate every provider credential.** The Gemini, Groq, DeepSeek, Mistral,
      OpenRouter and NVIDIA keys used in development were exposed in plaintext
      and must be treated as compromised. This gates everything below.
- [ ] Decide the provider set. Two of the six are unusable today: DeepSeek's
      account cannot pay, and OpenAI and Anthropic have no key at all. A
      multi-model product answering from one model is a degraded experience even
      when it reports that honestly.
- [ ] **Put the repository under version control.** It is not, today. The
      rollback procedure in [deployment.md](deployment.md) assumes a previous
      artifact exists to redeploy; without a commit history there is nothing to
      roll back to, and no CI can run.
- [ ] Choose a host. No deployment target exists yet. The shape is decided —
      one origin, one persistent backend process, managed MongoDB, platform TLS
      ([ADR-019](../decisions/ADR-019-staging-deployment-shape.md)) — and the
      runbook is in [deployment.md](deployment.md#staging-runbook).
- [ ] Confirm the platform's router does **not** buffer responses, and that its
      read timeout exceeds `ORCHESTRATION_TIMEOUT_MS`. This is the most likely
      first-deploy failure and it presents as a product bug.

## 1. Pre-release

- [ ] `pnpm verify` passes — typecheck, lint, 360+ tests, build, CSS gate
- [ ] `pnpm verify` passes a **second** time (catches ordering and timing flakes)
- [ ] `pnpm audit --audit-level=high` reports no known vulnerabilities
- [ ] No uncommitted changes; the artifact is built from the committed tree
- [ ] [readiness.md](readiness.md) reflects reality — no row upgraded without evidence

## 2. Configuration

Every variable is listed in [`.env.example`](../../.env.example). For production:

- [ ] `NODE_ENV=production`
- [ ] `WEB_ORIGIN` is the **exact** frontend origin, scheme included, no wildcard
- [ ] `MONGODB_URI` points at the production cluster, with credentials and TLS
- [ ] `MONGODB_DB_NAME` is not shared with staging or development
- [ ] `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` generated for **this** environment
      (`pnpm backend:keys`) and never reused from another one
- [ ] `TRUST_PROXY` set deliberately — see below. Leaving it at `false` behind a
      load balancer puts every visitor in one rate-limit bucket
- [ ] `TEST_PROVIDER_ENABLED` is absent or `false` (config refuses to start
      otherwise, but do not rely on that as the control)
- [ ] At least one provider key is set, or the process will exit 1 by design

### TRUST_PROXY

| Deployment | Value |
|---|---|
| Single load balancer or ingress in front | `1` |
| Two hops (CDN → load balancer) | `2` |
| Known proxy addresses only | `10.0.0.0/8,192.0.2.7` |
| Reachable only through a proxy that overwrites the header | `true` |
| Directly reachable from the internet | `false` |

Getting this wrong is a security decision, not a tuning decision: trusting the
header while directly reachable lets a client rotate `X-Forwarded-For` and
bypass registration and login rate limits entirely.

## 3. Secrets

- [ ] No secret is committed — `.env` is gitignored, `.env.example` holds names only
- [ ] Secrets are supplied by the platform's environment or secret manager
- [ ] No provider key exists in any `VITE_*` variable or the frontend bundle
- [ ] Key rotation understood: changing a provider key takes effect on restart,
      or within 15 minutes if the old key was rejected (see [ADR-016](../decisions/ADR-016-provider-health-and-verification.md))

## 4. Database

- [ ] Authentication enabled; the application user has read/write on its own
      database only, not cluster admin
- [ ] TLS enabled for anything not on the same host
- [ ] Backups configured **by the platform** — this application does not take
      backups and must not be assumed to
- [ ] Restore has been tested at least once
- [ ] Indexes: created automatically at boot by `ensureIndexes`. Confirm the log
      shows a clean start; index builds on a large existing collection can block

## 5. Providers

- [ ] At least one provider key configured
- [ ] `PROVIDER_LIVE=1 pnpm --filter @nexusai/backend vitest run tests/manual/provider-live.test.ts`
      run deliberately, and passing, against the keys being deployed
- [ ] `GET /api/models` shows the intended models as available and everything
      else honestly `NOT_CONFIGURED`

## 6. Build

```bash
pnpm --filter @nexusai/backend build
```

- [ ] `backend/dist/server.js` exists and is newer than the source
- [ ] Starts with plain `node dist/server.js` — no `--experimental-*` flag
- [ ] Frontend built with `pnpm --filter @nexusai/frontend build`, and the
      built-CSS gate passed

## 7. Security

- [ ] Cookies: `Secure` and `HttpOnly` present in production (asserted by
      `tests/security/production-config.test.ts`)
- [ ] HSTS present; served over HTTPS end to end
- [ ] CORS allows exactly `WEB_ORIGIN` with credentials
- [ ] Rate limits reviewed against expected traffic — **per instance**, so the
      effective limit multiplies by instance count

## 8. Verification against the running artifact

Not the source, and not a previous build:

- [ ] `GET /health/live` → 200
- [ ] `GET /health/ready` → 200 with `mongo: true`
- [ ] Register → `/api/auth/me` → 200
- [ ] `GET /api/models` → availability is honest
- [ ] One chat turn streams and persists
- [ ] Reload restores the turn from the database
- [ ] Logout → `/api/auth/me` → 401

## 9. Deployment

- [ ] Reverse proxy: buffering **off** for `/api/chat/stream`, read timeout
      above `ORCHESTRATION_TIMEOUT_MS`
- [ ] Process manager sends `SIGTERM` and waits — the server drains and exits
- [ ] A failed start is visible: the boot guard exits **1** with a fatal log line
- [ ] Logs shipped somewhere durable; they are the only record of provider failures

## 10. Post-deployment

- [ ] Readiness probe green
- [ ] One real chat turn through the real frontend, end to end
- [ ] Logs contain `model call finished` lines with real latencies
- [ ] No secret in any log line
- [ ] Error rate and provider availability watched for the first hour

## 11. Rollback

The artifact is a single file with no migration step, so rollback is a restart:

1. Redeploy the previous `dist/server.js` (or the previous image/release)
2. Restart; `ensureIndexes` is idempotent and safe to re-run

**Index caveat.** A release that changes indexes is not automatically reversible:
rolling back the code leaves the newer index in place. That is harmless for the
current change — the older code's queries still work, just with the in-memory
sort it had before — but check this explicitly for any future index change.

**No data rollback exists.** Restoring the database is a platform operation and
loses everything written since the snapshot. Prefer rolling forward.
