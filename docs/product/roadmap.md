# 51–59 · Implementation Plan

> **LEGACY — v1.0 phase plan.** Written for the single-model product and for a
> backend that does not exist. Phases 0-2 and 5 broadly describe what was
> built; phases 3-4 describe a single-model orchestrator that v2.0 replaces
> with parallel fan-out plus a synthesis pass. For current status see
> [capability-matrix.md](capability-matrix.md).


## 51. Phase Plan

### 51.1 Sequence and rationale

| Phase | Name | Duration | Ships | Why here |
|---|---|---|---|---|
| **0** | Foundation | 2–3 d | Monorepo, contracts, config, tokens, CI | Nothing can be verified without a harness |
| **1** | Authentication | 3–4 d | Register, login, sessions, guards, auth UI | User isolation must exist before user data does |
| **2** | Provider Platform | 4–5 d | Registry, adapters, health, availability, `GET /api/models` | Rule 2 — the abstraction is foundational, not retrofitted |
| **3** | Chat Orchestrator | 4–5 d | Classifier, ranker, failover, orchestrator — **no HTTP** | Routing correctness is provable before any transport exists |
| **4** | Real Streaming Chat | 5–6 d | SSE endpoint, persistence, cancellation, minimal UI | First end-to-end real response |
| **5** | Premium Frontend | 6–8 d | Full design system, sidebar, model selector, markdown, responsive, a11y | Built against a real backend, never against mocks |
| **6** | Hardening | 4–5 d | Security headers, rate limits, error UX, E2E, axe, load | Cannot harden what is not complete |
| **7** | Production | 3–4 d | Docker, CI/CD, observability, deploy, runbook | — |
| 8–12 | Multimodal · RAG · Memory · Comparison · Agents | — | Post-MVP | [MVP Exclusions](../decisions/README.md#60-mvp-exclusions) |

### 51.2 The ordering decision that matters most

**Phase 3 delivers a complete, tested orchestrator with no HTTP endpoint at all.**

The conventional approach builds the endpoint first and grows routing inside it. That produces a
route handler that owns policy, and by the time the policy is complex enough to matter it is
impossible to test without a server. Building the orchestrator as a pure, injectable object first
means every routing rule from [§30.6](../backend/ai-platform.md#306-required-routing-test-cases) is asserted
by a unit test before a single byte of SSE is written.

The second ordering decision: **Phase 5 (premium frontend) comes after Phase 4 (real streaming), not
before.** Building the polished UI against mocked responses guarantees a redesign when real streams
arrive with real latency, real failover notices, and real error states. Phase 4 ships a deliberately
plain UI that works; Phase 5 makes it excellent.

### 51.3 Definition of done, every phase

1. Acceptance criteria all checked, verified by the stated method.
2. `pnpm verify` green.
3. Coverage thresholds met for the areas touched.
4. No `TODO` without a linked issue; no commented-out code; no `any`.
5. Manual verification steps performed and recorded in the PR.
6. Documentation updated where the implementation deviated from this spec — **the spec is amended,
   not silently diverged from.**

---

## 52. Detailed Phase 0 Plan — Foundation

**Objective.** A monorepo where a trivial change can be typechecked, linted, tested, built, and
deployed. No product features.

**Dependencies.** None.

### Files to create

| File | Purpose | Must NOT contain |
|---|---|---|
| `package.json` | Workspace root, scripts from [§48.2](../architecture/quality.md#482-scripts) | App dependencies |
| `pnpm-workspace.yaml` | `apps/*`, `packages/*` | — |
| `tsconfig.base.json` | Strict compiler options ([§49.1](../architecture/quality.md#491-typescript)) | Path aliases to app internals |
| `.editorconfig`, `.prettierrc`, `eslint.config.js`, `.stylelintrc` | Formatting and lint, including the `boundaries` rules | Disabled rules without a comment |
| `.gitignore`, `.env.example` | `.env.example` has names + comments only | Any real value |
| `docker-compose.yml` | Mongo (single-node replica set) + Redis (AOF on) | The app itself |
| `.github/workflows/ci.yml` | The PR pipeline from [§47.5](../architecture/quality.md#475-cicd) | Deploy steps |
| `packages/contracts/src/{auth,models,conversation,message,chat,error}.ts` | Zod schemas + inferred types | Business logic, I/O |
| `packages/contracts/src/index.ts` | Explicit named re-exports — the one permitted barrel | `export *` |
| `apps/api/src/server.ts` | Entry: config → runtime → app → listen → signal handlers | Route definitions |
| `apps/api/src/app/build-app.ts` | Fastify instance, plugin order | Business logic |
| `apps/api/src/app/error-handler.ts` | The single `AppError` → HTTP mapping | Business logic |
| `apps/api/src/app/request-context.ts` | requestId, child logger | Auth logic |
| `apps/api/src/config/env.ts` | Zod-validated env, exits non-zero on failure | Defaults for secrets |
| `apps/api/src/domain/errors.ts` | `AppError` + `Errors` factories + `ErrorCode` | HTTP types |
| `apps/api/src/infrastructure/observability/logger.ts` | Pino with redaction paths + pattern serializer | Business logic |
| `apps/api/src/infrastructure/mongodb/client.ts` | Connection + pool config | Queries |
| `apps/api/src/infrastructure/redis/client.ts` | Connection + degradation helper | Domain logic |
| `apps/api/src/modules/health/routes.ts` | `/health/live`, `/health/ready` | Provider names, counts |
| `frontend/index.html` | Pre-paint theme script with CSP nonce, font preload | Inline styles |
| `frontend/src/main.tsx` | `createRoot`, providers, router | Feature logic |
| `frontend/src/styles/tokens.css` | **Every token from [§8](../design/language.md#8-design-tokens)** | Component styles |
| `frontend/src/styles/base.css` | Reset, focus ring, reduced-motion block | Component styles |
| `frontend/src/app/{router,providers,query-client,error-boundary}.tsx` | Shell wiring | Feature logic |
| `frontend/src/components/{button,input,dialog,logo,visually-hidden}.tsx` | The primitives Phase 1 needs | Domain imports |
| `frontend/tests/unit/tokens.test.ts` | Contrast assertions for every documented pair | — |

### Interfaces established

```ts
// domain/errors.ts
type ErrorCode = /* the 26 codes from §41.3 */;
class AppError extends Error { /* §41.2 */ }
export const Errors = { /* one factory per code */ };

// config/env.ts
export type Config = z.infer<typeof ConfigSchema>;
export function loadConfig(env: NodeJS.ProcessEnv): Config;   // throws + exits on invalid
```

### Tests

- `env.ts`: valid config parses; each required var missing → exit non-zero; invalid Mongo URI rejected;
  `MOCK_PROVIDER_ENABLED=true` with `NODE_ENV=production` is forced to `false`.
- `tokens.test.ts`: every foreground/background pair in [§10.1](../design/language.md#101-dark-theme--the-primary-experience)
  and [§10.2](../design/language.md#102-light-theme--designed-independently-not-inverted) meets its
  stated ratio. This test is the mechanism that makes the palette a contract rather than a claim.
- `contracts`: each schema accepts a valid payload, rejects each invalid variant, strips unknown keys.
- Health endpoints: `live` returns 200 with Mongo stopped; `ready` returns 503.

### Acceptance criteria

```text
[ ] pnpm install succeeds from a clean clone
[ ] pnpm dev:services starts Mongo (replica set) and Redis
[ ] pnpm dev starts api on 8080 and web on 5173
[ ] GET /health/live → 200
[ ] GET /health/ready → 200 with services up, 503 with Mongo stopped
[ ] GET /health/ready response contains no provider names
[ ] pnpm verify green
[ ] Missing JWT_PRIVATE_KEY → process exits non-zero with a named, valueless error
[ ] Theme switches with no flash on reload; no FOUC in dark or light
[ ] Token contrast test passes; deliberately darkening --color-text-muted fails it
[ ] eslint boundaries rule rejects a domain/ file importing mongodb
[ ] CI runs all steps on a PR
```

### Risks

| Risk | Mitigation |
|---|---|
| Tailwind v4 `@theme` unfamiliarity | Build the token layer first and verify utility generation before any component |
| Mongo replica-set setup in compose | Init script with a healthcheck-gated `rs.initiate()`; documented in the README |
| Boundaries lint misconfiguration silently allowing violations | A committed fixture file that *must* fail lint, asserted in CI |

### Verification

**Manual:** clean clone → install → dev → both ports respond; toggle theme in both directions and on
reload; stop Mongo and confirm `ready` fails while `live` passes.
**Automated:** `pnpm verify` + the CI pipeline + the deliberately-failing boundaries fixture.

---

## 53. Detailed Phase 1 Plan — Authentication

**Objective.** Real users, real sessions, real isolation. Every later phase can assume
`request.user.id`.

**Dependencies.** Phase 0.

### Files to create

| File | Purpose | Must NOT contain |
|---|---|---|
| `api/src/domain/user.ts` | `User`, `UserPreferences`, `UserId` brand | Hashing, Mongo |
| `api/src/domain/ports.ts` | `UserRepository`, `Clock` | Implementations |
| `api/src/modules/auth/password.ts` | Argon2id hash/verify, tuned params, fixed dummy hash | Token logic |
| `api/src/modules/auth/token-service.ts` | Access sign/verify (Ed25519), refresh mint/rotate/revoke, reuse detection | HTTP, cookies |
| `api/src/modules/auth/auth-service.ts` | Register, login, logout, refresh, me, patch me | Cookie serialization |
| `api/src/modules/auth/routes.ts` | Six endpoints, cookie setting, Zod schemas | Hashing, token internals |
| `api/src/infrastructure/mongodb/user-repository.ts` | `users` queries + collation index | Business rules |
| `api/src/infrastructure/redis/session-store.ts` | `session:*`, family sets, grace window | Token signing |
| `api/src/app/authenticate.ts` | Fastify hook: verify `nx_at` → `request.user` | Authorization |
| `api/src/app/csrf.ts` | Origin allowlist + `X-Nexus-Client` check on mutations | — |
| `web/src/features/auth/api.ts` | Five calls | Component logic |
| `web/src/features/auth/use-session.ts` | `['session']` query, login/register/logout mutations | Rendering |
| `web/src/features/auth/require-auth.tsx` | Route guard, `?next=` preservation | Forms |
| `web/src/features/auth/components/{login-form,register-form,password-field}.tsx` | Forms per [§60 Auth UI](overview.md#51-registration) | API calls (use the hook) |
| `web/src/routes/{login,register}.tsx` | Composition only | Logic |
| `web/src/lib/http.ts` | fetch wrapper: credentials, CSRF header, 401 → refresh → replay once, error mapping | Feature knowledge |

### Files to modify

`build-app.ts` (register auth module, csrf, authenticate hook) · `router.tsx` (public/private routes)
· `indexes.ts` (email unique + collation) · `env.ts` (JWT vars already present, now consumed).

### Schemas

```ts
RegisterRequest = { email: string(≤254, email), password: string(12–128), displayName: string(1–60) }
LoginRequest    = { email: string, password: string }
UserDto         = { id, email, displayName, preferences, createdAt }
PatchMeRequest  = { displayName?: string(1–60), preferences?: UserPreferences }
```

### Tests

**Unit:** Argon2 round-trip; verify fails on wrong password; unknown-email path performs a real hash
against the dummy (timing parity asserted within a tolerance band); access token sign/verify;
expired token rejected; wrong-audience rejected; tampered signature rejected; refresh rotation
produces a new token in the same family; reuse inside grace succeeds; reuse after grace revokes the
family.

**Integration:** I1–I5 from [§44.3](../architecture/quality.md#443-integration-tests). Plus: duplicate email
returns 409; email case-insensitivity via collation (`Omkar@x.com` collides with `omkar@x.com`);
logout is idempotent; `PATCH /me` cannot change email or `passwordHash` even if sent (fields stripped
by schema).

**Client:** `http.ts` replays exactly one request after a 401 refresh and does not loop when refresh
also 401s.

### Acceptance criteria

```text
[ ] user can register
[ ] duplicate email rejected with a field-scoped 409, form values preserved
[ ] email is case-insensitive at the index level
[ ] password under 12 chars rejected, with the rule shown before submission
[ ] user can login
[ ] invalid credentials rejected with an identical message for unknown email and wrong password
[ ] unknown-email and wrong-password response times are statistically indistinguishable
[ ] authenticated user can access /c/new
[ ] unauthenticated user hitting /c/:id redirects to /login?next=/c/:id and returns after sign-in
[ ] logout invalidates the refresh family; refresh afterwards returns 401
[ ] refresh rotates the token; the old token works within 60s grace and fails after
[ ] token reuse past grace revokes every session in the family
[ ] cookies are HttpOnly, Secure, correct SameSite, correct Path
[ ] no token is readable from document.cookie or localStorage
[ ] cross-site POST without X-Nexus-Client is rejected
[ ] forms are keyboard-operable; first invalid field receives focus on failed submit
[ ] errors announced via role="alert"
[ ] axe reports zero serious/critical on /login and /register in both themes
[ ] tests pass
```

### Risks

| Risk | Mitigation |
|---|---|
| Argon2 native binding fails on the deploy platform | Verify in the Phase 0 Docker image before depending on it; fallback plan is `argon2` (node-gyp) with the same parameters |
| Refresh races logging users out | The 60s grace window, tested explicitly with two concurrent refreshes |
| CSRF check breaking legitimate requests | `http.ts` sets the header centrally; an integration test asserts every mutating route rejects its absence |

### Verification

**Manual:** register in a fresh browser profile; inspect cookies in devtools and confirm `HttpOnly`;
run `document.cookie` and confirm the tokens are absent; wait out the 15-minute access token and
confirm the app keeps working via silent refresh; log out and confirm Back does not restore access.
**Automated:** the unit and integration suites above.

---

## 54. Detailed Phase 2 Plan — Provider Platform

**Objective.** A real, honest model catalog with real availability, served to the frontend. No chat
yet.

**Dependencies.** Phase 1 (the endpoint is authenticated).

### Files to create

| File | Purpose | Must NOT contain |
|---|---|---|
| `domain/model-descriptor.ts` | `ModelDescriptor`, capabilities, tiers | Provider HTTP |
| `domain/availability.ts` | The 7-state enum + `resolveAvailability` (pure) | I/O, `Date.now()` |
| `domain/ports.ts` (modify) | `ProviderAdapter`, `HealthResult`, `GenerationRequest`, `ProviderChunk` | Implementations |
| `infrastructure/providers/catalog.ts` | The typed catalog constant, Zod-validated at boot | Logic |
| `infrastructure/providers/registry.ts` | `get/list/listConfigured/listRoutable` — `listRoutable` filters `testOnly` with no opt-out | Availability policy |
| `infrastructure/providers/http-client.ts` | undici pools per origin, timeouts, abort wiring | Provider specifics |
| `infrastructure/providers/sse-parse.ts` | Upstream SSE frame parsing | Delta extraction |
| `infrastructure/providers/errors.ts` | Upstream → `AppError` per [§41.4](../architecture/security-operations.md#414-provider-error-classification) | HTTP responses |
| `infrastructure/providers/health-service.ts` | Jittered scheduler, Redis lock, snapshots, circuit breaker | Ranking |
| `infrastructure/providers/adapters/gemini.ts` | Google adapter — **the one real provider for this phase** | Ranking, persistence |
| `infrastructure/providers/adapters/openai-compatible.ts` | Shared request/parse core for the five compatible providers | Provider-specific auth quirks |
| `infrastructure/providers/adapters/{openai,anthropic,mistral,deepseek,groq,openrouter,nvidia}.ts` | Remaining adapters | Ranking, persistence |
| `infrastructure/providers/adapters/mock.ts` | `testOnly: true`, deterministic emission, configurable delay | Any production reachability |
| `infrastructure/redis/health-store.ts` | Snapshot + breaker read/write, degradation to `UNKNOWN` | Policy |
| `modules/models/catalog-service.ts` | Registry × availability → wire DTO; strips tiers and `rank` | HTTP |
| `modules/models/routes.ts` | `GET /api/models` | Availability computation |
| `web/src/features/models/{api.ts,use-models.ts}` | Query, `staleTime: 60s`, refetch on focus | Model names |

### Interfaces

Exactly as specified in [§26](../backend/ai-platform.md#26-provider-adapter-contract) — `info`, `listModels`,
`healthCheck`, `stream`. `generate()` and `getCapabilities()` are **not** implemented, per §26.1.

### Tests

**Unit:** `resolveAvailability` across all 7 states × snapshot present/absent/stale × breaker states
(the full matrix, ~40 cases); `listRoutable` never returns `testOnly` (property test over generated
catalogs); catalog `rank` uniqueness; catalog Zod validation rejects a malformed entry; breaker
transitions closed→open→half-open→closed and the cooldown doubling; `RATE_LIMIT` does not open the
breaker; error classification, one case per row.

**Fixture-driven adapter tests:** each adapter parses its recorded streaming fixture into the
expected `ProviderChunk` sequence; each maps its provider's content-policy signal to
`CONTENT_POLICY`; each aborts its upstream request within 100ms of signal abort; each surfaces a
malformed frame as `UNKNOWN` rather than throwing raw.

**Integration:** I28 (probe lock — two instances, one probe); health snapshot expiry produces
`UNKNOWN`; `GET /api/models` requires auth; `testOnly` absent when `NODE_ENV=production`;
`testOnly` absent when `MOCK_PROVIDER_ENABLED=false`; response contains no tier fields.

### Acceptance criteria

```text
[ ] GET /api/models returns the catalog with a resolved availability per model
[ ] with only GEMINI_API_KEY set: Gemini AVAILABLE, all others NOT_CONFIGURED
[ ] with no provider key: every model unroutable and auto.available === false
[ ] response contains no speedTier/qualityTier/costTier/reliabilityTier/rank/providerModelId
[ ] response contains no API key material
[ ] health probes run once per interval across two instances
[ ] a provider forced to fail 3× transitions to TEMPORARILY_UNAVAILABLE
[ ] recovery returns it to AVAILABLE without a restart
[ ] a 401 from a provider yields CONFIGURED_BUT_UNAVAILABLE, and the log says so at error
[ ] cold start reports UNKNOWN, never NOT_CONFIGURED, for a configured provider
[ ] Mock is absent from the payload in production
[ ] listRoutable() excludes testOnly under property testing
[ ] no provider identifier string appears in frontend/src outside test fixtures
[ ] no `if (provider === ...)` outside adapters (lint + grep test)
[ ] tests pass
```

### Risks

| Risk | Mitigation |
|---|---|
| Provider wire formats differ from documentation | Capture real fixtures early in the phase; treat the fixture as the contract |
| Health probes consume quota or trip rate limits | Cheapest endpoint, 60s interval, single-prober lock, jitter |
| Eight adapters is a lot of surface for one phase | Only Gemini + Mock must be complete to exit the phase; the rest may land behind their `NOT_CONFIGURED` state and be completed in Phase 6 |

### Verification

**Manual:** with only a Gemini key, load `/api/models` and read every state; revoke the key and watch
the state degrade within one probe interval; restore and watch recovery.
**Automated:** the suites above.

---

## 55. Detailed Phase 3 Plan — Chat Orchestrator

**Objective.** A fully tested routing and failover engine. **No HTTP endpoint is created in this
phase.** The exit criterion is that every rule in §30 and §32 is asserted by a test.

**Dependencies.** Phase 2.

### Files to create

| File | Purpose | Purity |
|---|---|---|
| `domain/chat/task-classifier.ts` | Text → `TaskClass` per [§29.3](../backend/ai-platform.md#293-task-classification--deterministic-not-llm-based) | pure |
| `domain/chat/capability-resolver.ts` | Task + attachments → required capabilities + token budget | pure |
| `domain/chat/candidate-resolver.ts` | Hard filters from [§30.1](../backend/ai-platform.md#301-hard-filters-applied-before-scoring); asserts `!testOnly` | pure |
| `domain/chat/model-ranker.ts` | Scoring + tie-break chain | pure |
| `domain/chat/failover-manager.ts` | Attempt policy, budget, token boundary | pure |
| `domain/chat/routing-decision.ts` | The recorded decision value object | pure |
| `domain/chat/orchestrator.ts` | The attempt loop, event emission, finalization | impure (ports only) |
| `domain/chat/weights.ts` | The five weight profiles from [§30.3](../backend/ai-platform.md#303-weight-profiles-per-task-class) | pure data |
| `modules/chat/routing-recorder.ts` | Structured decision log | impure (logger) |
| `tests/fixtures/fake-provider-adapter.ts` | The programmable fake from [§44.3](../architecture/quality.md#443-integration-tests) | — |

### Interfaces

```ts
class ChatOrchestrator {
  constructor(deps: {
    registry: ModelRegistry; availability: AvailabilityResolver;
    adapters: Map<string, ProviderAdapter>;
    messages: MessageRepository; conversations: ConversationRepository;
    classifier: TaskClassifier; ranker: ModelRanker;
    failover: FailoverManager; recorder: RoutingRecorder; clock: Clock;
  });

  /** Emits the ChatEvent sequence. Transport-agnostic — the caller decides framing. */
  run(request: OrchestratorRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
}
```

`run` returning `AsyncIterable<ChatEvent>` rather than writing to a response is the decision that
makes Phase 3 testable without a server: a test consumes the iterable and asserts the event sequence
directly.

### Tests — this phase is mostly tests

**Ranking:** T1–T12 from [§30.6](../backend/ai-platform.md#306-required-routing-test-cases), including the
1,000-iteration determinism loop and the weight-normalization assertion.

**Classification:** the ~50-row fixture table, one row per rule boundary.

**Failover:** the full matrix — 12 error codes × {0 tokens, >0 tokens} × {auto, manual} × {budget
available, exhausted}. Explicit assertions:
- Zero tokens + retryable + auto → next model attempted.
- **≥1 token + retryable + auto → no second attempt.** This is the single most important test in the
  system.
- Manual + `TIMEOUT` + 0 tokens → same model retried exactly once, then failure.
- Manual + any error → no different model is ever constructed.
- 3-attempt ceiling honored; no model attempted twice; 45s budget terminates the loop.

**Orchestrator (with fakes):** event ordering (`start` first, exactly one terminal); `metadata`
carries `firstTokenMs`; failover populates `FailoverRecord`; cancellation mid-iteration finalizes
`cancelled`; the `finally` finalization is idempotent under a simulated abort/complete race.

### Acceptance criteria

```text
[ ] Auto never selects a testOnly model — asserted 1,000× and as a property test
[ ] with only Mock configured, Auto yields NO_MODEL_AVAILABLE
[ ] routing is deterministic: identical inputs → identical selection, 1,000 runs
[ ] every weight profile row sums to 1.00
[ ] tie-break chain always resolves to exactly one model
[ ] manual selection is never substituted, under any error, in any test
[ ] no failover occurs after the first token, in any test
[ ] attempt budget capped at 3; no model repeated; 45s wall-clock respected
[ ] a partial response is finalized with an explicit non-complete status on every failure path
[ ] no message is left in `streaming` on any code path
[ ] routing decisions log candidates, scores, selection, and exclusions with reasons
[ ] model-ranker.ts contains no Date.now(), no Math.random(), no I/O import
[ ] domain/ imports no mongodb, ioredis, fastify, undici, or pino (lint)
[ ] orchestrator.ts under 200 lines; ranker under 90
[ ] coverage of domain/chat ≥ 95%
[ ] no HTTP endpoint was added in this phase
```

### Risks

| Risk | Mitigation |
|---|---|
| The orchestrator accretes policy and becomes the 1,000-line file the brief forbids | The line ceiling is an acceptance criterion, and every decision has a named pure collaborator to move into |
| Weight tuning becomes endless bikeshedding | Weights are data in one file with a test asserting normalization; tuning is a follow-up PR, not a blocker |
| Failover matrix under-tested because it is tedious | The matrix is generated programmatically from the code table, so a new error code produces new failing cases automatically |

### Verification

**Manual:** none required — this phase has no user surface, which is intentional.
**Automated:** the full unit suite; coverage gate on `domain/chat` at 95%.

---

## 56. Detailed Phase 4 Plan — Real Streaming Chat

**Objective.** A real message to a real provider, streamed, persisted, cancellable, in a deliberately
plain UI.

**Dependencies.** Phase 3.

### Files to create

| File | Purpose | Must NOT contain |
|---|---|---|
| `domain/conversation.ts`, `domain/message.ts` | Entities, `MessageStatus`, `ModelRef`, metadata | Mongo types |
| `infrastructure/mongodb/{conversation,message}-repository.ts` | Queries Q1–Q8, every one filtered by `userId` | Business rules |
| `modules/chat/sse-writer.ts` | Frame writing, 15s heartbeat, backpressure via `write()` return + `drain` | Business logic |
| `modules/chat/routes.ts` | `POST /stream`, `POST /regenerate` — validate, authorize, iterate, frame. **Under 120 lines** | Ranking, provider logic, retry policy |
| `modules/conversations/{routes,conversation-service}.ts` | List, get, rename, delete | Chat logic |
| `modules/messages/{routes,message-service}.ts` | History with cursor pagination | Chat logic |
| `infrastructure/mongodb/startup-sweep.ts` | Stale `streaming` → `failed` at boot | Request logic |
| `web/src/lib/sse.ts` | SSE parser over `ReadableStream`; split chunks, multi-event chunks, CRLF, comments | Feature logic |
| `web/src/features/chat/stream-reducer.ts` | The pure reducer from [§20.6](../frontend/architecture.md#206-the-stream-reducer) | I/O |
| `web/src/features/chat/use-chat-stream.ts` | Send, stream, cancel, finalize into the query cache | Rendering |
| `web/src/features/chat/api.ts` | Message history query | Streaming |
| `web/src/features/chat/components/{message-list,user-message,assistant-message,composer}.tsx` | **Plain, unstyled-beyond-tokens** implementations | Design polish (Phase 5) |
| `web/src/features/conversations/{api.ts,use-conversations.ts}` | List + mutations with optimistic rollback | Rendering |
| `web/src/routes/conversation.tsx` | `/c/new` and `/c/:id` | Logic |

### Files to modify

`indexes.ts` (conversation + message indexes) · `build-app.ts` (register modules) · `server.ts`
(startup sweep, graceful shutdown finalization) · `router.tsx` (conversation routes).

### Tests

**Integration:** I6–I13, I17–I18, I20–I25 from [§44.3](../architecture/quality.md#443-integration-tests). The
non-negotiables: I8 (cancellation aborts upstream within 100ms and persists the partial), I11 (no
failover after first token), I21 (shutdown finalizes), I22 (sweep), I25 (`explain()` shows `IXSCAN`).

**Unit:** `sse.ts` against adversarial chunk boundaries — an event split mid-`data:`, two events in
one chunk, a `:keepalive` comment, a CRLF-framed event, a truncated final frame.
`stream-reducer` across all 36 pairs.

**Repository scan test:** fails the build if any `find`/`update`/`delete` in the repository layer
lacks a `userId` term.

### Acceptance criteria

```text
[ ] a real message to a real provider streams token by token, visibly incremental
[ ] the first message creates the conversation; the URL replaces /c/new → /c/:id
[ ] the title is derived server-side from the first message, no second LLM call
[ ] both messages persist; refresh restores content, model, and latency exactly
[ ] the attribution line shows a measured model and a measured latency
[ ] no timer function appears anywhere in the streaming path (asserted)
[ ] Stop halts generation; the partial is retained and persisted as `cancelled`
[ ] the upstream provider request is aborted within 100ms of Stop
[ ] closing the tab mid-stream persists the partial as `cancelled`
[ ] a mid-stream failure retains the partial and persists it as `failed`, with no failover
[ ] no message is ever left in `streaming` after a graceful shutdown
[ ] the startup sweep converts a stale streaming message to `failed`
[ ] history paginates; 200 messages load without a scroll jump
[ ] the composer stays focusable and editable during generation
[ ] auto-follow disengages when the user scrolls up; Jump to latest appears
[ ] cross-user conversation and message access returns 404
[ ] every repository query filters by userId (scan test)
[ ] Q1–Q5 use IXSCAN, never COLLSCAN
[ ] duplicate clientMessageId returns 409 and generates once
[ ] chat/routes.ts under 120 lines and contains no provider or ranking logic
[ ] tests pass
```

### Risks

| Risk | Mitigation |
|---|---|
| Proxy buffering makes streaming appear broken | `X-Accel-Buffering: no` from the start; a staging verification step through the real proxy is an acceptance item in Phase 7 |
| Abort not propagating to the provider socket | I8 asserts upstream closure within 100ms, per adapter |
| Backpressure ignored → memory growth on slow clients | `write()` return value checked; a load test with a deliberately slow reader in Phase 6 |
| Per-token React state destroying input responsiveness | RAF coalescing implemented in this phase, not deferred; keystroke-to-paint budget asserted in Phase 6 |

### Verification

**Manual:** send a long code-generation prompt and confirm visible incremental rendering; type in the
composer while it streams; press Stop halfway and refresh to confirm the partial survived; kill the
API process mid-stream and confirm the message is not left `streaming` after restart.
**Automated:** the suites above.

---

## 57. Detailed Phase 5 Plan — Premium Frontend

**Objective.** Implement the design system in full, against the real backend from Phase 4.

**Dependencies.** Phase 4.

### Files to create

| Area | Files |
|---|---|
| Primitives | `components/{icon-button,textarea,dropdown,listbox,popover,tooltip,toast,skeleton,alert,empty-state}.tsx` |
| Shell | `components/app-shell.tsx`, `features/conversations/components/{sidebar,conversation-list,conversation-item,conversation-search,account-menu,delete-dialog}.tsx` |
| Chat surface | `features/chat/components/{chat-header,empty-chat,prompt-suggestion,message-metadata,message-actions,message-error,failover-notice,jump-to-latest,send-button,stop-button,attachment-button}.tsx` |
| Markdown | `features/chat/markdown/{renderer,code-block,table,blockquote}.tsx`, `styles/markdown.css` |
| Models | `features/models/components/{model-selector,model-option,model-sheet}.tsx` |
| Settings | `features/settings/components/{settings-dialog,appearance-section,account-section}.tsx`, `routes/settings.tsx` |
| Hooks | `features/chat/use-scroll-anchor.ts`, `lib/{keyboard,clipboard,format}.ts` |
| Stores | `stores/{ui-store,theme-store}.ts` |
| Pure logic | `features/conversations/group-by-recency.ts` |

### Tests

**Unit:** `group-by-recency` boundary cases including a DST transition; `format` latency and relative
time; `listbox` keyboard behavior (arrows skip disabled options and group headers, Home/End,
typeahead with a 500ms buffer, Escape restores focus); `use-scroll-anchor` engage/disengage
thresholds.

**Component:** `ModelSelector` full combobox semantics — `aria-expanded`, `aria-activedescendant`,
`aria-selected`, disabled options unselectable; **Enter inside the open listbox selects and does not
submit the chat**; loading, error, and empty catalog states render correctly.

**E2E:** E10 (keyboard-only journey), E11 (375px), E12 (axe on every route × theme × state), E14
(theme persistence, no flash).

### Acceptance criteria

```text
[ ] every token in §8 exists in tokens.css and no component contains a raw hex value (stylelint)
[ ] dark and light are independently designed; light is not an inversion
[ ] the composer's left edge aligns to the message column's left edge, asserted in pixels
[ ] the conversation measure is 720px and never spans the monitor
[ ] assistant messages have no card, no border, no fill, no avatar
[ ] the active conversation uses a 2px accent rail, not a filled block
[ ] the empty state populates the composer from a suggestion and focuses it, without sending
[ ] the model selector is fully keyboard-operable per §13.3 and never submits on Enter
[ ] model availability comes from the backend; no model name exists in the frontend source
[ ] unavailable models are listed, disabled, and annotated with a reason
[ ] markdown supports GFM: headings, lists, tables, blockquotes, inline and fenced code, links
[ ] code blocks show language, copy, and horizontal scroll; highlighting runs only on complete
[ ] no dangerouslySetInnerHTML anywhere (lint)
[ ] links open with rel="noopener noreferrer nofollow"; javascript: and data: render as text
[ ] every component implements its state row from §14.1
[ ] exactly eleven animations exist; none animates width, height, top, or left
[ ] prefers-reduced-motion removes all motion; the caret becomes static, skeletons static
[ ] every route works at 375, 390, 768, 1024, 1440 in both themes with no horizontal overflow
[ ] touch targets ≥44×44 below 1024px
[ ] focus is visible on every interactive element; no outline:none without replacement
[ ] axe reports zero serious/critical violations on any route in either theme
[ ] screen reader announces generation start and completion with attribution, not per token
[ ] entry bundle ≤180KB gzipped
[ ] no animation library, no component library, no icon package beyond tree-shaken Lucide
[ ] tests pass
```

### Risks

| Risk | Mitigation |
|---|---|
| Design drift toward decoration under time pressure | The §6.2 forbidden list and the §54 removal test are review checklist items on every frontend PR |
| Model selector accessibility half-implemented | Component tests assert the full ARIA contract, not just rendering |
| Markdown re-parse cost during streaming | Block-level memoization implemented with the renderer, verified by the keystroke-to-paint budget |
| Bundle creep from Shiki grammars | Grammar list capped at ~12 and asserted by the size gate |

### Verification

**Manual:** the §54 design-quality bar on every screen — hierarchy, density, alignment, typography,
interaction, 375px, mouse-free operation. Then the removal test: disable all shadows and transitions
in devtools and confirm the product still reads as premium.
**Automated:** component, E2E, axe, and bundle-size suites.

---

## 58. Detailed Phase 6 Plan — Hardening

**Objective.** Make the system correct under attack, under load, and under failure.

**Dependencies.** Phase 5.

### Work items

| Area | Deliverable |
|---|---|
| Headers | `helmet` with the exact CSP from [§39.4](../architecture/security-operations.md#394-security-headers), nonce wiring for the theme script |
| CORS | Single-origin allowlist, credentials, no reflection |
| Rate limits | All four classes from [§35.8](../api/contracts.md#358-rate-limits) with headers |
| Redis degradation | The seven per-subsystem policies from [§40.2](../architecture/security-operations.md#402-degradation-policy--per-subsystem-deliberately-different), each with a test |
| Error UX | Inline message errors, retry affordances, failover notice, offline banner, degraded composer |
| Remaining adapters | Complete any adapter deferred from Phase 2, with fixtures |
| Load testing | Sustained concurrent streams; slow-reader backpressure; memory stability |
| Secret hygiene | Bundle scan, `VITE_*` name check, pre-commit key-pattern hook, forced-error redaction test |
| Full E2E | E1–E15 |
| Log review | Read a full production-shaped log sample and confirm nothing sensitive is present |

### Acceptance criteria

```text
[ ] every header in §39.4 present on every response; CSP has no unsafe-inline for scripts
[ ] the theme bootstrap script executes under the nonce CSP with no violation
[ ] connect-src 'self' verified — a browser-side fetch to a provider API is blocked
[ ] each rate limit class enforces its documented limit and returns Retry-After
[ ] each of the seven Redis subsystems behaves exactly per §40.2 under a forced outage
[ ] Redis down: users with a valid access token keep working; refresh returns 401
[ ] Mongo down: chat is rejected with a clear error; no response is generated that cannot be persisted
[ ] browser offline: composer disabled, banner shown, existing conversation still readable
[ ] no provider configured: composer disabled with "No real models are currently available."
[ ] every error state in §47 (loading, empty, populated, error, offline, disabled, partial) exists on every screen
[ ] no user-facing message contains a stack trace, provider body, or internal identifier
[ ] a forced error containing a fake API key produces [REDACTED] in the log line
[ ] the production bundle contains no string matching any provider key pattern
[ ] no VITE_ variable name matches KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL
[ ] 50 concurrent streams sustained with stable memory and no dropped events
[ ] a deliberately slow reader does not grow process memory unboundedly
[ ] keystroke-to-paint under 32ms while streaming at 60 tokens/sec
[ ] E1–E15 pass on Chromium and WebKit
[ ] axe zero serious/critical across all routes, themes, and states
[ ] pnpm audit --audit-level=high clean
[ ] tests pass
```

### Risks

| Risk | Mitigation |
|---|---|
| CSP breaks the theme bootstrap or Shiki styles | Wire the nonce in Phase 0's `index.html`, verify in staging before hardening |
| Load testing reveals an architectural problem late | Run a minimal load test at the end of Phase 4 as a smoke check, not only here |
| Rate limits too aggressive for real usage | Limits are config, and the E2E suite uses an isolated user so limits can be tuned without breaking tests |

---

## 59. Detailed Phase 7 Plan — Production

**Objective.** Deployed, observable, operable.

**Dependencies.** Phase 6.

### Deliverables

| File / item | Purpose |
|---|---|
| `apps/api/Dockerfile` | Multi-stage, non-root, read-only FS, `dumb-init`, healthcheck |
| `.github/workflows/deploy.yml` | Build → push → staging → smoke → manual gate → production |
| `infrastructure/observability/metrics.ts` | Every counter, histogram, and gauge from [§43.2](../architecture/security-operations.md#432-metrics) |
| `/metrics` endpoint | Internal-only or token-protected |
| `docs/RUNBOOK.md` | Provider outage · Redis outage · Mongo outage · stuck streaming messages · key rotation · rollback · reading a routing decision from logs |
| `docs/adr/ADR-001…008.md` | The eight records from [§62](../decisions/README.md#62-adr-recommendations) |
| `.env.example` (final) | Every variable from [§47.2](../architecture/quality.md#472-environment-variables), names only |

### Acceptance criteria

```text
[ ] image builds reproducibly, under 150MB compressed, runs as non-root with a read-only FS
[ ] SIGTERM drains in-flight requests and finalizes active streams before exit
[ ] rolling deploy causes no orphaned `streaming` messages and no 5xx spike
[ ] /health/live and /health/ready wired to platform probes with correct semantics
[ ] /metrics is not publicly reachable
[ ] every metric in §43.2 emits real values under real traffic
[ ] no metric is synthetic, estimated, or placeholder
[ ] a routing decision is traceable from a requestId to its candidates, scores, and exclusions
[ ] secrets come from the platform secret manager; none is present in any image layer
[ ] streaming verified end to end through the real production proxy
[ ] Redis has AOF persistence enabled; a restart does not log every user out
[ ] Mongo indexes verified present in production
[ ] rollback to the previous image tag verified in staging
[ ] RUNBOOK covers all seven scenarios with concrete commands
[ ] all eight ADRs written with context, decision, alternatives, reasoning, consequences
[ ] every MVP item from §71 of the brief is present and real
[ ] every MVP exclusion is genuinely absent, not stubbed
```

### Risks

| Risk | Mitigation |
|---|---|
| Production proxy buffers SSE despite headers | Explicit staging verification through the real proxy is an acceptance item, not an assumption |
| Redis without AOF silently deployed | Documented as a hard deployment requirement; a startup check logs a `warn` if persistence is off |
| First real provider bill larger than expected | Per-user chat rate limits and the 3-concurrent-stream cap are in place before launch; provider spend alerts configured as an operational task |
