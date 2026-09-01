# ADR-019 — Frontend and backend deploy behind one origin

Status: **Accepted** · 2026-08-28

## Context

Phase 9 set out to deploy staging. Before choosing a host, the code was read to
find out what it actually requires. Three constraints turned out to be decided
already, by the implementation rather than by preference.

**1. The client calls a relative path.** `frontend/src/lib/http.ts` opens with
`const BASE = '/api'`. There is no build-time API URL; `VITE_API_URL` exists
only to point the Vite dev-server proxy at `localhost:8080`. A production build
therefore issues same-origin requests to `/api/*` and nothing else.

**2. The cookies assume same-origin.** The access cookie is `SameSite=Lax` and
the refresh cookie is `SameSite=Strict`, scoped to `Path=/api/auth`. Both work
unchanged when the API shares the frontend's origin. Split across two origins,
`Strict` stops being sent at all and `Lax` stops being sent on the requests that
matter — the flow would need `SameSite=None; Secure` on both, which is a
weaker posture adopted for no product reason.

**3. The backend is a stateful process.** Rate-limit counters and provider
health live in memory (ADR-013), and a chat turn holds an SSE connection open
for as long as the models take. It needs a persistent process, not a function
that may be frozen, replayed, or duplicated between requests.

## Decision

**Serve the frontend and the API from one origin**, with the platform routing
`/api/*` to the backend process and everything else to the built static files.

**Run the backend as a single persistent instance** for staging.

**Use managed MongoDB.** Verified reachable from this machine: server 8.0.30,
`ensureIndexes` completes against it, the sessions TTL index survives, and a
write/read round trip takes ~370ms.

**Take TLS from the platform.** Production sets `Secure` on both cookies, so
staging must be HTTPS or sign-in silently fails — a `Secure` cookie is never
sent over plain HTTP.

That rules out, for now: a static host and an API host on separate domains
(cookie posture), and serverless or edge functions for the backend (SSE
duration, in-memory state). It rules in any platform that can run a Node
process behind a router that does not buffer responses.

## Consequences

- **The proxy must not buffer.** The backend already sends
  `X-Accel-Buffering: no` and `Cache-Control: no-transform`, and the read
  timeout must exceed `ORCHESTRATION_TIMEOUT_MS` (150s). A platform that
  buffers responses or caps them below that delivers the answer in one lump at
  the end, or cuts it off. This is the single most likely way a first
  deployment fails, and it will look like a product bug.
- **`TRUST_PROXY` must be set** to the number of hops in front of the backend,
  or unauthenticated rate limits key on the proxy's address and every visitor
  shares one bucket (ADR-016).
- **`WEB_ORIGIN` is still required** and still exact: it is the CORS allowlist,
  and same-origin deployment does not make it optional.
- **Scaling to a second instance is a decision, not a slider.** Rate limits and
  provider health are per-process; two instances double the effective limit and
  each learns provider health independently. Neither is dangerous, both are
  surprising if unplanned.
- If the frontend ever needs its own origin, the change is `BASE` in
  `http.ts` plus both cookie `SameSite` values — a deliberate edit in two
  places, not a config toggle.

## Alternatives rejected

**Separate origins for app and API.** Conventional, and normally fine. Here it
would force `SameSite=None` on the refresh token to solve a problem the product
does not have.

**Serverless backend.** Attractive for a staging environment that is idle most
of the time. Incompatible with holding an SSE connection for the length of a
multi-model turn, and it would silently break the in-memory rate limiting and
circuit breaker by giving each invocation its own copy.
