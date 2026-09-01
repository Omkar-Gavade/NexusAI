# Backend Production Readiness

Status: **CURRENT** · Updated 2026-08-28 — Phase 9. Every row states where it was verified: LOCAL, REAL PROVIDER, or STAGING.

Assessed against the running system, not against intent. No row says "done".

| Area | State | Basis |
|---|---|---|
| **Production runtime** | PASS | `pnpm build` emits `dist/server.js`; started with plain `node`, zero experimental flags, full journey exercised |
| **Auth** | PASS *(LOCAL, real MongoDB)* | Argon2id (OWASP params), Ed25519 JWTs, rotation with reuse detection, family revocation, constant-time unknown-email path. Minimum password length is **4** — a policy value that does not touch hashing |
| **Credential persistence** | PASS *(LOCAL, real MongoDB)* | Acceptance journey through the **compiled artifact**: register → user document written with an `$argon2id$` hash and no recoverable plaintext → **full process restart** → login with the same credentials → `/api/auth/me` returns the same identity → authenticated turn persisted and read back → logout → login again |
| **Token semantics** | PASS | Expired access token → `TOKEN_EXPIRED`; missing/invalid → `UNAUTHENTICATED`. Asserted by test |
| **Logout** | **PARTIAL** | Revokes the refresh family immediately and clears both cookies. An **already-issued access token stays valid until it expires** (default 15 min) — access tokens are stateless by design |
| **Authorization / IDOR** | PASS | Ownership is a query filter, never a check; cross-user access returns 404, never 403 |
| **Database** | PASS | 4 collections, indexes incl. TTL on sessions and a unique partial index enforcing send idempotency. Backups are the platform's responsibility and are **not** provided by this application |
| **Index coverage** | PASS | Every production query verified by `explain()` to be index-served with no `COLLSCAN` and no blocking sort. Asserted in `tests/integration/indexes.test.ts` |
| **Pagination** | PASS | Cursor for conversations and messages; multi-page walk asserted for no duplicates or gaps |
| **API contract** | PASS | Every SSE event validated against `ChatEvent` in tests; no contract weakened |
| **Model registry** | PASS | Availability derived from real call outcomes; routing internals absent from the wire shape |
| **Provider adapters** | PASS | Real generation observed from Google, Mistral and Groq across runs. DeepSeek's key is valid but the account cannot pay; OpenAI and Anthropic have no key |
| **Provider coverage** | **PARTIAL** | Free-tier accounts, and they are not simultaneously healthy: a Phase 8 turn had Gemini rate-limited and DeepSeek unpayable, leaving **one** of three models answering. The pipeline degraded honestly, but a one-model "multi-model" answer is a thin product experience |
| **Orchestration** | PASS | Bounded concurrency, per-call timeout, partial failure, all-failure, honest `responded` count |
| **Synthesis** | PASS | Real second pass over real responses, verified with live models. Fails over to another synthesis-capable model when the first is unavailable, but only before any text has streamed |
| **Synthesis input boundary** | PASS | Untrusted model output and the user's question are fenced with a per-turn random label, so neither can close its section and issue instructions ([ADR-017](../decisions/ADR-017-synthesis-trust-boundary.md)) |
| **Stance** | PASS | Only ever from the synthesiser's verdict block. Invalid values, unknown model ids, duplicates and unclosed blocks all degrade to `unknown`; classified counts can never exceed `responded` |
| **Provenance** | PASS | Every planned model recorded including failures; stance only when judged |
| **Streaming** | PASS | SSE with backpressure, heartbeat, `X-Accel-Buffering: no`; no per-model deltas. Each model reported as it lands, verified against the clock |
| **Synthesis streaming** | PASS | Incremental even when the synthesiser emits no verdict block, so a non-compliant model cannot buffer the whole answer |
| **Cancellation** | PASS | Fetch abort propagates to provider calls; verified both pre-fan-out and in-flight |
| **Rate limiting** | **PARTIAL** | Enforced on auth, refresh, chat **and reads**, scoped per user — but **per-instance**, not globally coordinated (ADR-013). Verified under load: 6 users × 20/min cut off at exactly 120 turns |
| **Proxy trust** | PASS | `TRUST_PROXY` fails closed and is explicit. Forged `X-Forwarded-For` cannot buy a fresh rate-limit bucket when untrusted; a trusted hop gives distinct clients distinct buckets |
| **Performance** | **PARTIAL** | API and database latency measured against the compiled artifact (p95: models 2 ms, conversations 4 ms, history 7 ms, SSE first delta 9 ms, full turn 7 ms). **Provider latency is absent — the test adapter returns instantly**, so these are not turn latencies a user would see |
| **Resources** | PASS | 216 turns across 8 and 6 concurrent users: RSS plateaued at ~136 MB and fell to 119 MB when load stopped; file handles flat at 42–43. No leaked stream, socket or connection |
| **Provider health** | PASS | A rejected credential marks the provider `CONFIGURED_BUT_UNAVAILABLE` and is re-checked after a cooldown rather than believed forever |
| **Cost control** | PASS | Max models, max concurrency, prompt size, body size, per-user concurrent stream cap — all backend-enforced |
| **Security headers / CORS** | PASS | Helmet; single exact origin with credentials; HSTS only in production |
| **Secrets** | PASS | Read once in `config/env.ts`; path + pattern log redaction; absent from every response, asserted by test |
| **Observability** | PASS | Structured Pino with request-id correlation through HTTP → orchestrator → adapter |
| **Health / shutdown** | PASS | Liveness touches nothing external; readiness pings Mongo; SIGTERM verified to drain, close and release the port |
| **Concurrency isolation** | PASS | Four concurrent users verified isolated across conversations, messages and provenance |
| **Testing** | PASS | 203 backend tests; every defect found, including the five that only real providers exposed, has a regression test |
| **Deployment process** | PASS | [release-checklist.md](release-checklist.md) and [deployment.md](deployment.md) are operational and match real commands |
| **AI quality** | **PARTIAL** | Qualitative smoke evaluation run against real models across seven categories: [ai-quality.md](ai-quality.md). Seven prompts, one run each — observations, not measurements |
| **Deployed environment** | **NOT IMPLEMENTED** | No staging or production environment exists and none was created in Phase 9: no host, no domain, no TLS termination, no deployed instance. Shape decided and documented ([ADR-019](../decisions/ADR-019-staging-deployment-shape.md)) with a runbook in [deployment.md](deployment.md), but **NOT VERIFIED** |
| **Managed database tier** | PASS *(remote)* | The one staging component genuinely verified off this machine: managed MongoDB 8.0.30 reachable, `ensureIndexes` completes, sessions TTL intact, write/read round trip ~370ms — against ~1ms locally, which is the latency a deployed turn will actually pay |
| **Version control** | **BLOCKING** | The repository is **not under version control**. There is no previous commit and no previous artifact, so the documented rollback procedure has nothing to roll back to, and no CI can run |
| **Credential hygiene** | **BLOCKING** | The configured provider credentials were exposed in plaintext during development. Verified in Phase 9 that `.env` has not been modified since they were written, so **rotation has not happened**. Hard gate on any deployment |
| **Deployment** | **PARTIAL** | Artifact builds and runs; not deployed anywhere, no container image, no CI |
| **Sources** | **NOT IMPLEMENTED** | The contract describes a *retrieved document*; nothing retrieves. Emitted empty, never inferred from URLs in prose ([ADR-018](../decisions/ADR-018-sources-remain-planned.md)) |
| **Usage reporting** | **PARTIAL** | Per-model counts come only from what a provider reported, never estimated. Totals cover the **fan-out only** — the streaming synthesis pass is not counted, so the figure under-reports rather than over-reports |
| **Cost accounting** | **NOT IMPLEMENTED** | No pricing layer exists and none is invented. Spend is bounded by the limits below rather than priced |
| **Real-provider E2E** | PASS | Re-confirmed in Phase 8 through the compiled artifact. Three models fanned out; Gemini rate-limited, DeepSeek rejected, Mistral answered; **the synthesis failed over from Gemini to Mistral and the turn completed** with a correct answer, streamed, persisted, provenance truthful, `responded: 1 of 3` |

## What "BLOCKED" means here

`REAL PROVIDER E2E: BLOCKED — credentials unavailable.` Every journey was
verified through the real frontend, real backend, real MongoDB and the
**deterministic test adapter**. That is labelled `TEST ADAPTER E2E` throughout
and is never described as real-provider verification.

Phase 3 narrowed what is unverified without overstating it. The adapters were
exercised in two ways that need no credential:

- **Against a local server speaking each provider's dialect** — request shaping,
  auth header placement, response and usage parsing, and SSE reassembly across
  chunk boundaries. `tests/integration/adapter-wire.test.ts`.
- **Against the live endpoints**, with a deliberately invalid key. All six
  providers reach the real service and their rejection is classified as
  `AUTH_ERROR`. `tests/manual/provider-live.test.ts`, run with `PROVIDER_LIVE=1`.

What remains unverified is exactly one thing: **a successful generation.** No
model has produced a token for this system. The same opt-in suite runs a real
generation per provider as soon as a key is present, so closing this gap is one
command, not new work.

## Known limitations, stated plainly

- **Rate limits and provider health are per-instance.** Behind a load balancer
  the effective chat limit multiplies by instance count. This is a consequence
  of not running Redis (ADR-013), not an oversight.
- **No retry layer.** Transient provider failures are recorded as failures and
  the turn proceeds with the models that succeeded. This stays a deliberate v1
  decision: with no retries there is no retry storm, no hidden cost multiplier
  and no ambiguity about what the provenance rail is reporting. Bounded retry
  for genuinely transient classes is future work.
- **Provider health is re-checked, not permanent.** A rejected credential is
  believed for 15 minutes, then one call is allowed through. Without that a
  single spurious 401 would disable a provider until someone restarted the
  process.
- **Logout does not kill an already-issued access token.** `authenticate`
  verifies the signature and expiry only, so an authenticated request costs no
  database round trip. The cost is a window — bounded by
  `ACCESS_TOKEN_TTL_SECONDS`, 15 minutes by default — in which a *retained copy*
  of the token still works after signing out. The browser drops the cookie, so
  this affects a captured token, not an ordinary sign-out. Shorten the window by
  lowering the TTL; close it entirely only by adding a session lookup to every
  request, which is a different architecture and should be an ADR. Asserted
  explicitly in `tests/integration/auth.test.ts`.
- **`PATCH /api/auth/me` is implemented and tested but not called by the client.**
- **No container image and no CI pipeline.**
