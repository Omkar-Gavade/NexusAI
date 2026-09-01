# Backend Deployment

Status: **PARTIAL** — the production artifact builds and runs, and has been
exercised in a **local production simulation**. It has not been deployed to any
staging or production environment, and nothing here should be read as saying it
has.

Step-by-step release procedure: [release-checklist.md](release-checklist.md).

## Prerequisites

| | |
|---|---|
| Node | 22 or newer (the build targets `node22`) |
| pnpm | 9 |
| MongoDB | 8, reachable from the backend, with authentication enabled |
| TLS | terminated in front of the backend; cookies are `Secure` in production |
| Reverse proxy | required in practice — see SSE and `TRUST_PROXY` below |

## Order of operations

1. Configure environment (below) and provision MongoDB
2. `pnpm install`
3. `pnpm --filter @nexusai/frontend build` → static assets in `frontend/dist`
4. `pnpm --filter @nexusai/backend build` → `backend/dist/server.js`
5. Install runtime dependencies where the backend will run: `pnpm install --prod`
6. Start: `node dist/server.js`
7. Confirm `/health/ready` returns `mongo: true`
8. Run the post-deployment checks in the release checklist

## Build and runtime

```bash
pnpm --filter @nexusai/backend build
```

Emits `dist/server.js` (~300 KB ESM) plus a source map and a `package.json`
declaring `{"type":"module"}`. Type checking runs first as a separate gate —
esbuild strips types, it does not check them.

```bash
pnpm --filter @nexusai/backend start:prod
```

Runs plain `node dist/server.js`. **No experimental flags.** Runtime
dependencies stay external, so `node_modules` must be installed alongside
(`pnpm install --prod`). Rationale in
[ADR-015](../decisions/ADR-015-production-build.md).

Development still uses `--experimental-transform-types --watch`; production
never does.

## Environment

Every variable is listed in `backend/.env.example`. Required in production:
`MONGODB_URI`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `WEB_ORIGIN`.

**`TRUST_PROXY` is a security setting, and it fails closed.** Unauthenticated
rate limits — registration and login, the credential-stuffing surface — are keyed
on the client IP. Behind a proxy with `TRUST_PROXY=false`, that IP is the
proxy's, so every visitor shares one bucket. Trusting the header while the
service is directly reachable is worse: a client sets its own
`X-Forwarded-For` per request and the limits never fire. Set it to the number of
proxy hops (`1` for a single load balancer), or to the specific addresses you
trust.

**Secrets** come from the platform's environment or secret manager. This project
deliberately does not integrate a specific secret store: reading
`process.env` once at boot works identically under systemd, Docker, Fly, Render,
ECS and Kubernetes, and every one of those already has its own mechanism.
`.env` files are for local development and are gitignored.

Provider keys are optional; a provider without one reports `NOT_CONFIGURED` and
`auto.available` goes false when nothing is routable. Keys are read once, in
`config/env.ts`, and never leave the process.

`TEST_PROVIDER_ENABLED=true` causes the process to **exit non-zero** when
`NODE_ENV=production`.

**A production server with no provider key configured refuses to start.** It
would otherwise come up healthy with a permanently disabled composer, which is a
worse failure than not starting. The check runs after the registry is built and
before the HTTP listener opens.

## Schema

Index creation is idempotent and runs at boot. Non-idempotent changes get a
numbered script under `backend/migrations/` and are run explicitly.

## Health probes

| Path | Semantics |
|---|---|
| `/health/live` | Touches nothing external. Failure means restart |
| `/health/ready` | Pings Mongo. Failure means stop routing traffic here |

Provider availability is deliberately **not** part of readiness: a third party's
outage should not take every instance out of rotation.

## Graceful shutdown

`SIGTERM`/`SIGINT` stop new work and drain in flight requests. Draining closes
live SSE sockets, which is the same signal a client disconnect produces, so
provider calls are cancelled rather than left running. A 15-second watchdog
forces exit if drain stalls.

## Scaling

The service is stateless apart from in-flight streams, so instances scale
horizontally. Two caveats, both from
[ADR-013](../decisions/ADR-013-backend-stack-and-no-redis.md):

- Rate limits are per-instance, so the effective limit multiplies by instance
  count.
- Provider health is learned per-instance.

Neither is a correctness problem. Both are reasons to reintroduce a shared store
before scaling out, and each is one class behind one interface.

## Logging

Structured JSON via Pino, with path-based redaction plus a pattern scrubber that
rewrites anything resembling a provider key or JWT. Prompts and model output are
never logged.

## Operational behaviour worth knowing before you deploy

**The server refuses to start with no usable provider.** Exit code 1, with a
fatal log line naming the fix. A deployment that starts healthy while chat can
never work is a worse failure than one that does not start, because the first
kind gets discovered by users. Reviewed in Phase 3 and deliberately kept.

**Rate limits and provider health are per instance.** Auth, refresh, chat and
read limits are in-process fixed windows ([ADR-013](../decisions/ADR-013-backend-stack-and-no-redis.md)).
Behind a load balancer the effective limit multiplies by the instance count, and
each instance learns provider health independently. With one instance both are
exact. Do not describe these as globally coordinated.

**A rejected provider credential is believed for 15 minutes, then re-checked.**
The model reports `CONFIGURED_BUT_UNAVAILABLE` and disappears from routing; after
the cooldown one call is allowed through. Fixing a key therefore takes effect
without a restart, and a spurious 401 during a provider incident cannot disable
that provider indefinitely ([ADR-016](../decisions/ADR-016-provider-health-and-verification.md)).

**Provider credentials are only ever sent as headers.** Never in a query string,
so they cannot reach a reverse-proxy access log.

**SSE requires buffering to be disabled end to end.** The backend sets
`X-Accel-Buffering: no` and `Cache-Control: no-transform`. If you terminate TLS
or proxy through nginx, confirm `proxy_buffering off` for `/api/chat/stream` and
a read timeout above `ORCHESTRATION_TIMEOUT_MS`; otherwise the synthesis arrives
in one lump at the end, or the connection is cut mid-answer.

**SIGTERM drains and releases the port.** Verified against the compiled
artifact, not assumed.

### Cost ceiling per user

Backend-enforced, so a modified client cannot exceed it:

| Control | Default |
|---|---|
| Models per request | 5 |
| Concurrent model calls | 4 |
| Concurrent streams per user | 3 |
| Chat requests | 20 / minute |
| Prompt history sent upstream | 20 messages, 24,000 chars |
| Model / synthesis timeout | 60s / 90s |
| Retries | none — deliberate, see [readiness.md](readiness.md) |

Worst case for one account is therefore 20 turns per minute, each fanning out to
at most 5 models plus one synthesis pass: **120 provider calls per minute**.
Size provider quota accordingly, and lower `chat` in `rate-limit.ts` if that
ceiling is too high for your billing.

### What the token figures do and do not cover

`metadata.inputTokens` / `outputTokens` sum **only the fan-out models**, and only
where a provider actually reported usage. The synthesis pass streams, and the
streaming path does not read usage, so its tokens are absent — the figure
under-reports the turn rather than over-reporting it. It is deliberately left as
an undercount rather than topped up with an estimate: a computed number
presented as measured usage is exactly the failure this product exists to avoid.

There is no pricing layer, so the backend cannot report spend. Cost is bounded
by the limits in the table above, not priced. If you need spend attribution,
that is a real feature: pricing per model, captured synthesis usage, and a
decision about who sees it.

## Reverse proxy

A proxy is effectively required: TLS termination, and `TRUST_PROXY` only means
anything when something is forwarding. The one thing it must not do is buffer
the chat stream.

nginx:

```nginx
location /api/chat/stream {
    proxy_pass              http://backend;
    proxy_http_version      1.1;
    proxy_buffering         off;
    proxy_cache             off;
    proxy_set_header        Connection '';
    proxy_read_timeout      180s;   # above ORCHESTRATION_TIMEOUT_MS
    proxy_set_header        X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

The backend already sends `X-Accel-Buffering: no` and
`Cache-Control: no-cache, no-transform`, which nginx honours — but
`proxy_read_timeout` must still exceed `ORCHESTRATION_TIMEOUT_MS` (default
150s) or long turns are cut mid-answer.

**Verified here:** streaming survives an intermediary hop with headers intact
and chunks arriving incrementally, tested through a local streaming proxy.
**Not verified here:** behaviour through nginx or any specific cloud load
balancer. Confirm buffering and timeouts on the proxy you actually deploy.

## Health and readiness

| Endpoint | Checks | Use for |
|---|---|---|
| `GET /health/live` | nothing external | liveness probe / restart decisions |
| `GET /health/ready` | MongoDB `ping` | readiness probe / traffic admission |

Liveness deliberately touches nothing: a probe that fails on a database blip
restarts a process that is fine and makes an outage worse.

Readiness reports **reachability only**. It does not report which providers are
configured — that would be an unauthenticated information leak — and it does not
fail when providers are down, because the boot guard already prevents starting
with none, and a provider outage after start is reported per model through
`/api/models` rather than by removing the instance from the load balancer.

## Logs

Structured JSON (pino) on stdout. Ship it somewhere durable; it is the only
record of provider behaviour.

Correlation: every line carries `requestId`, and a chat turn emits one
`model call finished` line per model (`modelId`, `provider`, `outcome`,
`latencyMs`, `errorCode`) plus a `chat turn completed` line (`planned`,
`responded`, `durationMs`).

Never logged: prompts, model responses, passwords, tokens, cookies, provider
keys. Verified by inspecting the logs of a running artifact, not by reading the
logger config.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Exits 1 with "No model provider is configured" | No provider key in a production environment | Set a provider key. This is the boot guard working |
| Exits 1 with "TEST_PROVIDER_ENABLED must be false in production" | Test adapter enabled in production | Unset it. It returns placeholder text and must never serve users |
| Exits 1 with "Invalid environment configuration" | A required variable is missing or malformed | The names are printed; values never are |
| Answer arrives all at once at the end | Proxy is buffering | `proxy_buffering off` for the stream route |
| Stream cut mid-answer | Proxy read timeout below the orchestration timeout | Raise `proxy_read_timeout` |
| Registration rate-limited for everyone | Behind a proxy with `TRUST_PROXY=false` | Set the hop count |
| Rate limits never trigger | `TRUST_PROXY` trusting a header from a directly reachable service | Set it to the specific hops or addresses |
| Model shows "credentials were rejected" | Provider rejected the key | Fix the key; it is re-checked after 15 minutes without a restart |
| `/health/ready` 503 | MongoDB unreachable | Check `MONGODB_URI`, network, credentials |

## What is deliberately absent

No Dockerfile, no CI pipeline, no container registry, no infrastructure code.
The artifact is a single JavaScript file plus `node_modules`, which every
platform can run directly. Adding a Dockerfile that nothing builds, or a
pipeline nothing runs, would be documentation pretending to be infrastructure.

If the target platform needs a container, the image is `node:22-slim`, copy
`dist/` and production `node_modules`, `CMD ["node", "dist/server.js"]`, and
point the health check at `/health/ready`.

## Staging runbook

Not yet executed — see [readiness.md](readiness.md). Everything below is
derived from the artifact this repository actually produces, and the shape is
fixed by [ADR-019](../decisions/ADR-019-staging-deployment-shape.md): **one
origin, one persistent backend process, managed MongoDB, platform TLS.**

### 0. Before anything

Rotate every provider credential. The keys used in development were exposed in
plaintext and must be treated as compromised. Deploying them is worse than not
deploying.

### 1. Build

```bash
pnpm install
pnpm --filter @nexusai/frontend build
pnpm --filter @nexusai/backend build
```

Produces `frontend/dist/` (static) and `backend/dist/server.js` (~334 KB ESM).
The backend keeps its runtime dependencies external, so the deployed image or
slug also needs production `node_modules`:

```bash
pnpm install --prod
```

### 2. Run

```bash
node dist/server.js
```

Node 22+. No `--experimental-*` flag, ever, in production.

### 3. Route

One origin. `/api/*` to the backend process; everything else to
`frontend/dist`, with an SPA fallback to `index.html` so client routes like
`/app/chat/:id` resolve on a hard refresh.

**The route carrying `/api/chat/stream` must not buffer**, and its read timeout
must exceed `ORCHESTRATION_TIMEOUT_MS` (default 150s). nginx:

```nginx
location /api/ {
    proxy_pass              http://backend;
    proxy_http_version      1.1;
    proxy_buffering         off;
    proxy_read_timeout      180s;
    proxy_set_header        X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

On a platform router, find the equivalent settings before deploying; a buffered
response is the most likely first failure and presents as a product bug.

### 4. Environment — names only, never values

| Variable | Required | Notes |
|---|:-:|---|
| `NODE_ENV` | ✓ | `production`. Enables `Secure` cookies and HSTS |
| `MONGODB_URI` | ✓ | Managed cluster, with credentials and TLS |
| `MONGODB_DB_NAME` | ✓ | Not shared with development |
| `WEB_ORIGIN` | ✓ | Exact scheme + host of the deployed site |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | ✓ | Ed25519 PEM, generated for **this** environment (`pnpm backend:keys`) |
| `TRUST_PROXY` | ✓ in practice | Hop count, e.g. `1`. Left unset behind a proxy, every visitor shares one rate-limit bucket |
| `PORT` | | Defaults 8080; most platforms inject their own |
| At least one `*_API_KEY` | ✓ | The process exits 1 with none configured |
| `TEST_PROVIDER_ENABLED` | | Must be absent or `false`; config refuses to start otherwise |

Supplied by the platform's secret store or environment. `.env` is for local
development and is gitignored.

### 5. Health

`GET /health/live` — liveness, touches nothing external.
`GET /health/ready` — readiness, pings MongoDB. Point the platform's check here.

### 6. First-deploy checks, in order

1. `/health/ready` returns `{"status":"ok","mongo":true}`
2. `GET /api/models` — availability is honest, no key material in the response
3. Register in a browser; confirm both cookies are `Secure` + `HttpOnly` and
   that `document.cookie` is empty
4. Send one real question; confirm tokens arrive **incrementally**, not in one
   lump at the end — this is the buffering test
5. Reload; the turn and its provenance come back from the database
6. Check the logs for the per-model `model call finished` lines, and for the
   absence of anything secret

### 7. Rollback

The artifact is one file and there is no migration step, so rollback is a
redeploy of the previous `dist/server.js` (or previous image) and a restart.
`ensureIndexes` is idempotent and safe to re-run.

**Index caveat.** A release that changes indexes is not automatically
reversible: rolling back the code leaves the newer index in place. Harmless for
the current set — older code's queries still work, just without the index that
removed a blocking sort — but check it explicitly for any future index change.

**There is no data rollback.** Restoring the database is a platform operation
and loses everything written since the snapshot. Prefer rolling forward.

### What this runbook cannot tell you

It has never been executed. Every statement above is derived from the artifact
and from local runs. The parts most likely to differ on a real platform are
response buffering, proxy timeouts, and the hop count for `TRUST_PROXY`.
