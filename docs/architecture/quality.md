# 44–50 · Quality, Performance, Deployment, Standards

> **PARTIAL.** The frontend testing, performance and coding-standards sections
> are current and enforced. The integration and E2E chapters describe a
> backend that does not exist, so those suites are unwritten. Actual test
> inventory: [capability-matrix.md](../product/capability-matrix.md).


## 44. Testing Strategy

### 44.1 Shape of the pyramid, and where we deliberately deviate

```text
        E2E  ~12 specs        real browser, real Mongo/Redis, Mock provider + one real-provider smoke
     ────────────────────
    Integration ~60 tests     real Mongo + Redis via testcontainers, fake provider adapters
  ──────────────────────────
 Unit  ~250 tests             pure domain logic, zero I/O
```

The deviation from the conventional pyramid is that **the most valuable tests in this product are
integration tests of the streaming lifecycle**, not unit tests. Streaming correctness is a property
of the interaction between the orchestrator, the adapter, the abort signal, and the repository — none
of which a unit test can observe. So integration is over-weighted relative to a typical CRUD app.

### 44.2 Unit tests — what must be exhaustively covered

| Target | Cases | Why exhaustive |
|---|---|---|
| `ModelRanker` | 12 scenarios from [§30.6](../backend/ai-platform.md#306-required-routing-test-cases), plus a 1,000-iteration determinism loop | Routing is the product's core claim |
| `resolveAvailability` | All 7 states × {snapshot present/absent/stale} × {breaker closed/open/half-open} | A wrong state is a dishonest UI |
| `TaskClassifier` | ~50-row fixture table, one row per rule boundary | Classification drives weights |
| `FailoverManager` | Full matrix: 12 error codes × {0 tokens, >0 tokens} × {auto, manual} × {budget left, exhausted} | The token boundary is the rule most likely to be broken by a later change |
| `stream-reducer` (client) | All 36 (phase × event) pairs | Illegal transitions must be provably handled |
| Provider error classification | One case per row of [§41.4](security-operations.md#414-provider-error-classification) | Misclassification causes wrong retries |
| `deriveTitle` | Empty, whitespace, 1 char, exactly 60, 61 with mid-word break, CJK, emoji, newlines | Runs on every first message |
| `selectHistory` | Fits, exactly fits, overflows by one, single huge message, all cancelled | Context assembly bugs are silent |
| `group-by-recency` (client) | Boundary times at midnight, 7d, 30d, DST transition, empty list | Off-by-one is user-visible |
| Token/contract schemas | Valid, missing field, wrong type, extra field stripped, boundary lengths | Contract is the trust boundary |
| Design tokens | Computed contrast of every documented pair meets its stated threshold | Prevents a palette edit silently breaking AA |

**No mocking of our own code.** Unit tests exercise pure functions with real inputs. If a test needs
a mock of something we wrote, that is a signal the unit is not actually a unit.

### 44.3 Integration tests

Real MongoDB and Redis via `testcontainers`. **No in-memory Mongo substitute** — `mongodb-memory-server`
does not reproduce index behavior, collation, or write-concern semantics, which are exactly the
things worth testing here. Containers start once per suite, collections are dropped between tests.

Providers are replaced by a `FakeProviderAdapter` that is *programmable*, not a generic mock:

```ts
const provider = new FakeProviderAdapter()
  .willEmit('Hello', ' world')
  .thenFinish('stop');

const flaky = new FakeProviderAdapter()
  .willFailWith(Errors.providerUnavailable({}))      // fails before any token
  .onAttempt(2).willEmit('recovered').thenFinish('stop');

const stalling = new FakeProviderAdapter()
  .willEmit('partial')
  .thenStallFor(25_000);                              // triggers inter-token idle timeout
```

Required integration cases:

| # | Case | Asserts |
|---|---|---|
| I1 | Register → login → cookies set | httpOnly, Secure, SameSite, correct paths |
| I2 | Refresh rotation | New token works, old token within grace works, old token after grace revokes family |
| I3 | Reuse detection | Second use of a rotated token past grace kills all sessions |
| I4 | Cross-user conversation read | Returns 404, not 403, and does not appear in list |
| I5 | Cross-user message read | Returns 404 |
| I6 | First message creates conversation | Conversation + user message + assistant message persisted; title derived |
| I7 | Full stream lifecycle | Event order `start → delta+ → metadata → complete`; message `complete` with metadata |
| I8 | Cancellation mid-stream | Partial persisted with `cancelled`; provider request aborted within 100ms |
| I9 | Client disconnect | Same as I8 without a client to receive events |
| I10 | Failover before first token | Second model used; `FailoverRecord` persisted; single message row |
| I11 | **No failover after first token** | Partial persisted as `failed`; second model never attempted |
| I12 | Inter-token stall | Idle timeout fires; partial retained |
| I13 | Attempt budget exhausted | Exactly 3 attempts, no model repeated, terminal error |
| I14 | Auto with only Mock configured | `NO_MODEL_AVAILABLE`; Mock never invoked |
| I15 | Manual unavailable model | 409 with the model named; no substitution occurs |
| I16 | Manual + retryable timeout | Same model retried once, then error — never a different model |
| I17 | Idempotency | Duplicate `clientMessageId` returns 409; one generation only |
| I18 | Concurrent stream cap | Fourth concurrent stream rejected |
| I19 | Redis down | Each subsystem behaves per [§40.2](security-operations.md#402-degradation-policy--per-subsystem-deliberately-different) |
| I20 | Mongo down mid-request | 503, no orphaned message rows |
| I21 | Graceful shutdown during stream | Message finalized `cancelled`, not left `streaming` |
| I22 | Startup sweep | A pre-seeded stale `streaming` message becomes `failed` |
| I23 | Delete conversation | Messages gone, conversation gone, other users' data untouched |
| I24 | Index presence | Every index from [§24.1](../backend/architecture.md#241-collections) exists after boot |
| I25 | Query plans | `explain()` on Q1–Q5 shows `IXSCAN`, never `COLLSCAN` |
| I26 | Rate limits | Each class enforces its documented limit and headers |
| I27 | Secret redaction | A forced error containing a fake API key produces `[REDACTED]` in the log line |
| I28 | Health probe lock | Two instances produce one probe per interval |

### 44.4 What is deliberately not tested

- Provider adapters against live provider APIs in CI. Rate limits, cost, and flakiness make that a
  bad gate. Adapters are tested against **recorded response fixtures** — one fixture per provider
  captured from a real call, checked in, with keys scrubbed. A separate manually-triggered workflow
  runs a real one-token call per configured provider, and it is a release checklist item, not a PR gate.
- Third-party library behavior.
- Visual pixel diffs of the whole UI. Snapshot suites of that kind produce constant false failures
  and get disabled. Layout invariants are asserted numerically instead (§16.7).
- Getters, constructors, and type-only code.

### 44.5 Coverage policy

Thresholds are per-area, because a single global number lets critical code hide behind well-covered
trivia:

| Area | Line coverage | Rationale |
|---|---|---|
| `domain/` | **95%** | Pure, cheap to test, highest consequence |
| `modules/*/`-services | 85% | I/O-adjacent |
| `infrastructure/providers/` | 80% | Fixture-driven |
| `frontend/src/features/*/` hooks and reducers | 85% | Streaming and mutation logic |
| Components | no threshold | Behavior is covered by E2E; a coverage target here produces render-and-assert-nothing tests |

Coverage is a diagnostic, not a goal. A PR that raises coverage by adding assertions on trivia is
rejected.

---

## 45. E2E Strategy

### 45.1 Environment

Playwright, Chromium + WebKit (Safari behavior around `dvh`, cookies, and streaming genuinely
differs), against a real stack: Vite preview build, real API, containerized Mongo and Redis.

**Provider strategy:** most specs run with `MOCK_PROVIDER_ENABLED=true` and Mock **explicitly
selected**, giving deterministic token timing. Auto-routing specs run with a fake real-provider
adapter injected via a test-only env flag (`FAKE_PROVIDER_AS_REAL=1`) so Auto has a genuine
non-testOnly candidate — this is the only test-only production-code branch in the system and it is
asserted absent when `NODE_ENV === 'production'`.

One spec, tagged `@live`, runs against a real configured provider and is excluded from PR runs.

### 45.2 The primary journey (from the brief)

```text
E1  register → login → new chat → Auto → real model → real stream → persist
    → refresh → restore → switch model → real response → logout
```

Step-by-step assertions:

| Step | Assertion |
|---|---|
| register | 201, redirected to `/c/new`, composer focused |
| login (after logout) | cookies present, `/c/new` reachable |
| new chat | Empty state visible, four suggestions, no conversation created yet |
| type + Enter | User message appears optimistically within 100ms |
| Auto | Response streams; **at least 2 distinct DOM text lengths observed** — proves real streaming, not a single paint |
| real model | Attribution line names a model that is **not** Mock |
| persist | `GET /messages` returns both messages with `status: complete` |
| refresh (F5) | Conversation restored, same content, same attribution, scroll at bottom |
| switch model | Selector opens, keyboard-navigable, selection applies |
| second response | Attribution names the newly selected model |
| logout | Cookies cleared, `/c/:id` redirects to `/login` |

### 45.3 The Mock-guard specs (mandatory, from the brief)

| # | Spec | Assertion |
|---|---|---|
| E2 | Mock explicitly selected in dev | Response arrives; attribution reads `Mock` |
| E3 | **Auto never selects Mock** | With Mock + one fake-real provider configured, 20 consecutive Auto sends produce zero `Mock` attributions |
| E4 | Auto with only Mock configured | Composer disabled, `No real models are currently available.`, `auto.available === false` |
| E5 | Production build | `GET /api/models` with `NODE_ENV=production` contains no `testOnly` model, and selecting `mock` returns 404 |

### 45.4 Remaining specs

| # | Spec |
|---|---|
| E6 | Cancellation — Stop mid-stream retains partial text, shows `Stopped.`, refresh shows the same partial |
| E7 | Failover disclosure — fake provider fails pre-token; the exact sentence renders and persists across refresh |
| E8 | Mid-stream failure — partial retained, error inline, `Regenerate` works |
| E9 | Rename + delete — optimistic update, rollback on forced failure |
| E10 | Keyboard-only journey — the entire E1 flow with zero mouse events, including model selection |
| E11 | Responsive — E1 at 375px: drawer, bottom-sheet selector, no horizontal overflow |
| E12 | Accessibility — `axe-core` on every route, both themes, streaming and idle states; zero serious/critical |
| E13 | Long conversation — 200 messages: load, scroll to top, paginate, send, stream (performance budget in §46.4) |
| E14 | Theme — dark/light/system, persisted, no flash on reload |
| E15 | Session expiry — expired access token triggers silent refresh and request replay, invisible to the user |

### 45.5 Anti-flake rules

- **No fixed waits.** No `waitForTimeout` in any spec. Assertions wait on state.
- **Semantic selectors only** — `getByRole`, `getByLabel`, `getByText`. No CSS class selectors, which
  couple tests to styling. Where a semantic handle does not exist, `data-testid` is added
  deliberately and is treated as API.
- **Deterministic streaming** — Mock emits a fixed token sequence at a fixed cadence.
- **Serial where required** — rate-limit specs run serially with an isolated user.
- **Fresh user per spec** — created via API, not the UI, except in E1 which tests registration itself.
- A flaky spec is quarantined and fixed within one working day, never retried into green. `retries: 0`
  locally; `retries: 1` in CI **with the retry reported as a failure signal**, not hidden.

---

## 46. Performance

### 46.1 Frontend budgets

| Metric | Target | Ceiling | Measured by |
|---|---|---|---|
| Entry JS, gzipped | 150 KB | 180 KB | `rollup-plugin-visualizer` + CI size gate |
| Total initial transfer | 220 KB | 260 KB | Lighthouse |
| First Contentful Paint | < 1.0s | 1.5s | Lighthouse, throttled 4G |
| Largest Contentful Paint | < 1.5s | 2.5s | Lighthouse |
| Time to Interactive | < 1.8s | 2.5s | Lighthouse |
| Cumulative Layout Shift | < 0.02 | 0.1 | Lighthouse |
| Interaction to Next Paint | < 100ms | 200ms | Lighthouse |
| Keystroke → paint while streaming | < 16ms | 32ms | Playwright trace |
| Theme switch | < 50ms | 100ms | Manual + trace |

The CI size gate fails the build on regression above the ceiling and warns above target. A bundle
that grows silently is how a 150KB app becomes a 600KB app.

### 46.2 Backend budgets

| Operation | p50 | p95 | p99 |
|---|---|---|---|
| `GET /api/auth/me` | 5ms | 15ms | 40ms |
| `GET /api/models` (warm) | 3ms | 10ms | 25ms |
| `GET /api/conversations` | 8ms | 25ms | 60ms |
| `GET /messages` (50) | 12ms | 35ms | 80ms |
| `POST /login` | 60ms | 110ms | 200ms |
| Chat preflight → `start` event | 20ms | 60ms | 120ms |
| Mongo single-doc read | 1ms | 4ms | 12ms |
| Redis op | 0.4ms | 1.5ms | 5ms |

Login is intentionally slow — that is Argon2 working. Its budget measures our overhead around the
hash, not the hash itself.

**Excluded from budgets: first-token latency and total generation time.** Those are provider-owned.
We measure and report them (`nexus_first_token_seconds`) but we do not set targets we cannot control,
because a target we cannot influence is theater. What we *do* control and budget is the 20ms of our
own work before the provider request goes out.

### 46.3 Performance-sensitive paths, named

1. **Delta → paint.** RAF coalescing, block-memoized markdown, `memo` on completed messages.
2. **Context assembly.** One indexed query, capped at 80 messages, computed in memory.
3. **Sidebar render.** Grouping is a single pass; rows are memoized on `(id, title, updatedAt)`.
4. **Model catalog.** Registry + availability resolution is pure and in-memory; health comes from a
   single Redis `MGET`, not one call per provider.
5. **Auth on every request.** Ed25519 verification only — no DB read, no Redis read, on the hot path.
6. **Provider connection reuse.** One `undici` pool per provider origin, keep-alive on. Cold TLS
   handshakes per request would add 100–200ms to every first token.

### 46.4 Long conversations

Designed against explicit targets, not assumptions:

| Length | Behavior | Budget |
|---|---|---|
| 10 | Everything rendered | instant |
| 50 | Everything rendered | < 100ms render |
| 200 | Newest 50 rendered; older loaded on scroll-up in pages of 50 | < 150ms per page, no scroll jump |
| 500+ | Same pagination; DOM caps at ~150 messages by unmounting pages scrolled far out of view | < 200ms, memory stable |

**Virtualization is not implemented**, and this is a measured decision rather than an omission.
Messages have wildly variable heights (a one-line answer vs. a 400-line code block), which is the
case virtualizers handle worst — height estimation causes scroll jumping, and scroll jumping during
streaming is far more damaging than the render cost being avoided. Pagination plus
`content-visibility: auto` on off-screen message wrappers achieves most of the benefit with none of
the scroll-anchoring risk.

The trigger to revisit: if E13 exceeds its 200ms budget at 500 messages on a mid-tier device, we
revisit with data. Not before.

### 46.5 What is not optimized

No memo on components that render once. No `useCallback` on handlers passed to DOM elements. No
service worker. No prefetching of conversations on hover. No image optimization (there are no
images). No HTTP/2 push. Each of these is a real technique that this product has no measured need
for, and adding them now would be optimizing before measuring.

---

## 47. Deployment

### 47.1 Topology

```text
Browser
   │ HTTPS
   ▼
CDN / static edge  ──────────  frontend build output, immutable hashed assets,
   │                           index.html served with no-cache
   │ /api/*  →  origin
   ▼
Container platform            apps/api, 2+ instances behind a load balancer
   │                          Node 22 Alpine, non-root, read-only FS, health probes
   ├──────────────►  MongoDB (managed, replica set, TLS, auth)
   ├──────────────►  Redis (managed, TLS, AOF persistence)
   └──────────────►  Provider APIs (egress only, from the backend, never the browser)

Secrets  ←  platform secret manager, injected as env at start. Never in an image.
```

No Kubernetes. Two container instances behind a load balancer on a managed platform is the correct
size for this system, and the brief explicitly forbids premature Kubernetes. The architecture does
not prevent it later — the API is stateless apart from in-flight streams.

### 47.2 Environment variables

```text
# Runtime
NODE_ENV                  development | test | production
PORT                      default 8080
LOG_LEVEL                 default info
WEB_ORIGIN                exact origin of the frontend, e.g. https://app.nexusai.example

# Data
MONGODB_URI
MONGODB_DB_NAME           default nexusai
REDIS_URL

# Auth
JWT_PRIVATE_KEY           PEM Ed25519 — required, no fallback
JWT_PUBLIC_KEY            PEM Ed25519 — required
JWT_ISSUER                default nexusai
JWT_AUDIENCE              default nexusai-web
ACCESS_TOKEN_TTL          default 15m
REFRESH_TOKEN_TTL         default 30d

# Providers — all optional; the system runs with any subset, including one
GEMINI_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
MISTRAL_API_KEY
DEEPSEEK_API_KEY
GROQ_API_KEY
OPENROUTER_API_KEY
NVIDIA_API_KEY

# Development / testing only
MOCK_PROVIDER_ENABLED     default false; forced false when NODE_ENV=production
ALLOW_CONTENT_LOGGING     default false; asserted false when NODE_ENV=production
DISABLED_MODELS           comma-separated model ids

# Frontend (build time) — note the absence of any provider variable
VITE_API_URL
```

`config/env.ts` validates all of this with Zod at boot and **exits non-zero on any failure**, printing
which variables are wrong without printing their values. A process that boots with a broken config
and fails later at request time is much harder to diagnose.

`.env.example` contains names and comments only. It is committed. `.env` is gitignored, and a
pre-commit hook rejects any staged file containing a string matching the provider-key patterns.

### 47.3 Development environment

```text
Frontend  5173     configurable via vite --port
Backend   8080     PORT
MongoDB  27017     docker-compose
Redis     6379     docker-compose
```

`docker-compose.yml` provides **MongoDB and Redis only**. The application runs on the host with
native watch mode, because containerizing the dev app costs rebuild latency and file-watching
reliability for no benefit. Mongo runs as a single-node replica set (`--replSet rs0`) so that local
behavior matches production, and so transactions remain available if ever needed.

### 47.4 Docker image

Multi-stage: `deps` (pnpm fetch + install) → `build` (tsc) → `runtime` (`node:22-alpine`, production
deps only). Runs as UID 1001, read-only root filesystem, `tmpfs` for `/tmp`, `dumb-init` as PID 1 so
`SIGTERM` reaches Node. Health check hits `/health/live`. Target compressed size under 150MB.

### 47.5 CI/CD

```text
PR:      install → typecheck → lint → unit → integration → build → bundle-size gate
                 → e2e (Chromium + WebKit) → axe → audit → secret scan
main:    all of the above → build image → push → deploy staging → smoke → manual gate → production
```

Deployment is rolling with health-gated instance replacement. Streams in flight on a draining
instance are finalized by the shutdown handler
([§21.7](../backend/architecture.md#217-graceful-shutdown)), so a deploy interrupts responses honestly rather
than leaving them dangling.

Rollback is redeploying the previous image tag. There are no schema migrations to reverse, which is
one of the practical benefits of the additive-only schema policy.

---

## 48. Development Workflow

### 48.1 Monorepo

```text
nexusai/
├── frontend
├── apps/api
├── packages/contracts
├── docs/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

`pnpm` workspaces. Turborepo and Nx are **rejected**: with three packages, `pnpm -r` plus a handful
of scripts is sufficient, and a build-orchestration tool would be config to maintain for a graph
this small. Revisit at ten packages.

### 48.2 Scripts

```text
pnpm dev              # api + web concurrently
pnpm dev:services     # docker compose up mongo redis
pnpm typecheck        # tsc --noEmit across the workspace
pnpm lint             # eslint + stylelint
pnpm test             # unit
pnpm test:integration # testcontainers
pnpm test:e2e         # playwright
pnpm build
pnpm verify           # typecheck + lint + test + build — what CI runs, runnable locally
```

`pnpm verify` existing as one command matters: a developer must be able to reproduce CI locally
without reading the CI config.

### 48.3 Branches and commits

Short-lived branches off `main`, `type/short-description`. Conventional Commits. Squash merge, so
`main` carries one commit per change. Every PR requires: green CI, one review, and a description
stating what changed and why. A PR touching a file over 250 lines must justify it (§19.2).

No emoji in commit messages.

---

## 49. Coding Standards

### 49.1 TypeScript

`strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.

- **`any` is banned.** `unknown` at boundaries, narrowed by a Zod parse. The lint rule has no
  allowlist; a genuine escape requires `@ts-expect-error` with a written reason, which is visible in
  review.
- **No type assertions across unrelated shapes.** `as` is permitted for branded-type construction at
  a repository boundary and for `as const`. Nothing else.
- **Discriminated unions over optional-field soup.** `MessageStatus` and `ChatEvent` are unions
  precisely so the compiler enforces exhaustiveness.
- **`readonly` on all domain types.** Domain objects are values; mutation happens in repositories.
- **Return types are explicit on exported functions.** Inferred return types on public API drift
  silently.

### 49.2 Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `model-ranker.ts` |
| React components | PascalCase, one per file, file kebab-case | `AssistantMessage` in `assistant-message.tsx` |
| Hooks | `use-` prefix | `use-chat-stream.ts` |
| Types / interfaces | PascalCase, **no `I` prefix** | `ProviderAdapter` |
| Constants | SCREAMING_SNAKE for module-level literals | `RANKING_WEIGHTS` |
| Booleans | `is/has/can/should` | `isRetryable`, `hasEmittedTokens` |
| Functions | verb phrase naming the specific action | `resolveAvailability`, `deriveTitle` |

Banned names, at any scope: `data`, `info`, `item`, `obj`, `temp`, `val`, `res` (except a Fastify
reply), `handler`, `manager` (except `FailoverManager`, where it names a real policy owner),
`helper`, `util`, `process`, `handle*`, `do*`, `stuff`, `thing`.

### 49.3 Functions and modules

- One exported concept per file.
- Functions do one thing; a function needing "and" in its name is two functions.
- Max 4 positional parameters; beyond that, an options object with a named type.
- Guard clauses over nested conditionals. Max nesting depth 3.
- No default exports except React lazy-route components.
- Errors are thrown, never returned as `{ ok: false }` — one error channel, one handling point.

### 49.4 Comments

Comments explain **why**, never **what**. The four legitimate categories:

```ts
// Gemini streams incremental candidates rather than pure deltas; the last chunk repeats
// the full text. We diff against the accumulated buffer rather than concatenating.
                                                              // ← provider quirk

// userId is duplicated onto messages so authorization is a single indexed query.
// The cost is that conversations can never change owner. See docs/05-backend.md §24.1.
                                                              // ← architectural reasoning

// Constant-time comparison against a fixed dummy hash so an unknown email and a wrong
// password take the same time. Do not short-circuit this.
                                                              // ← security decision

// 60s grace on the rotated token: two tabs can legitimately refresh concurrently.
                                                              // ← non-obvious constraint
```

Banned: `// Set the user ID`, `// Loop through items`, section-divider ASCII art in source files,
`// TODO` without an issue link, commented-out code, changelog comments, `@author` tags, and JSDoc
that restates the signature.

### 49.5 React specifics

- Function components only. No class components.
- Hook rules enforced by `eslint-plugin-react-hooks`; the exhaustive-deps rule is not disabled.
- No `useEffect` for derived state. Effects are for subscriptions, DOM measurement, and imperative
  focus only. A `useEffect` that calls `setState` from props is a code-review rejection.
- Props destructured in the signature, with an explicit props type.
- No prop drilling deeper than two levels — compose or read from the store instead.
- Keys are stable ids, never array indices.
- No inline object or array literals in props of memoized children.

### 49.6 Tooling

ESLint (`typescript-eslint` strict, `react-hooks`, `jsx-a11y`, `boundaries`, `no-restricted-syntax`
for provider names and `dangerouslySetInnerHTML`), Prettier (100 columns, single quotes, trailing
commas, semicolons), Stylelint for the custom-property naming convention and a rule forbidding raw
hex colors outside `tokens.css`. All run in `pnpm verify` and in a pre-commit hook via `lint-staged`.

---

## 50. Anti-AI-Code Rules

The codebase must read as the work of a disciplined human team. These are the specific patterns to
refuse, each with the reason it appears and the correct alternative.

### 50.1 Structural

| Forbidden | Why it appears | Correct approach |
|---|---|---|
| `utils/` `helpers/` `common/` `misc/` `shared/` directories | Default dumping ground when ownership is unclear | Name the concern. `lib/sse.ts`, `lib/clipboard.ts`. `lib/` is capped at five named files with ≥2 consumers each |
| A `services/` directory of unrelated functions | Layer-name-as-folder habit | Services live inside their module: `modules/auth/auth-service.ts` |
| Barrel `index.ts` re-exporting everything | Convenience | Import the concrete module. Barrels break tree-shaking and create cycles |
| `types.ts` holding unrelated types | Nowhere else to put them | Types live with the code that owns them; shared contracts live in `packages/contracts` |
| Empty directories for future features | "Extensible architecture" | Create the directory when the feature exists |
| Mirrored abstract base classes for one implementation | SOLID cargo cult | Concrete class. Extract an interface when the second implementation arrives |
| A factory producing one type | Pattern habit | `new Thing()` |
| Wrappers around wrappers | Defensive layering | Call the thing |
| Deep `index.ts` → `impl.ts` → `internal.ts` chains | Fear of one file | One file, well named |

### 50.2 Naming and functions

Forbidden: `handleData`, `processData`, `doStuff`, `genericHelper`, `manageThings`, `dataProcessor`,
`utilityFunction`, `helperMethod`, `mainHandler`, `executeOperation`.

Every function name states its specific action on its specific subject: `resolveAvailability`,
`deriveTitle`, `classifyProviderError`, `rotateRefreshToken`, `groupByRecency`.

### 50.3 Comment smells

Any of these in a diff is a review rejection:

```ts
// This function handles the user data                      ← restates the name
// Set the user ID                                          ← narrates the next line
userId = user.id;

/**
 * @param userId The user ID          ← adds nothing over the type
 * @returns The user                  ← adds nothing over the type
 */

// ============================================
// HELPER FUNCTIONS                             ← section banner in source
// ============================================

// TODO: improve this                           ← no issue, no owner, no meaning
```

### 50.4 Over-engineering

| Forbidden | Instead |
|---|---|
| Generic `Repository<T>` base class | Three concrete repositories with the queries they actually run |
| Plugin/registry system for two implementations | Two implementations behind one interface |
| Config object for every function | Positional parameters up to four |
| Event emitter for in-process calls | Call the function |
| DI container | The 60-line composition root (§21.4) |
| Custom state management library | TanStack Query + two Zustand stores |
| Abstraction layer over `fetch` over `undici` | One `http-client.ts` |
| Feature flags for unshipped features | Ship or don't |
| `BaseService`, `AbstractController`, `IRepository` | Concrete, named types |

### 50.5 The abstraction test

Before adding any abstraction:

> Is this solving a problem that exists **today**, in code that exists **today**?

If the honest answer involves "when we add", "in case we need", or "so it's flexible" — do not add it.
Two of the abstractions in this specification pass the test and are worth naming as examples:
`ProviderAdapter` exists because there are nine implementations today; the OpenAI-compatible request
core exists because five adapters share it today. `ModelRegistry` exists because availability
resolution needs a single lookup point today. Nothing else in the design is an interface for its own
sake.

### 50.6 The scale ceilings

| Thing | Ceiling | If exceeded |
|---|---|---|
| File | 250 lines | Justify in the PR, or split along a real seam |
| Function | 50 lines | Extract a named step |
| Component | 150 lines | Extract a child component with a real name |
| Function parameters | 4 | Options object |
| Nesting depth | 3 | Guard clauses |
| `if/else if` chain | 3 branches | Lookup table or discriminated union |

### 50.7 The final code test

> If an experienced engineer opened this repository without knowing it was AI-assisted, would they
> recognize it as clean, intentional production code?

Concretely, they would find: three collections, five files in `lib/`, one error class, seven small
orchestration collaborators of which six are pure, nine adapters that each do one translation, two
global stores containing four values, eleven animations, and a comment density of roughly one comment
per fifty lines — each explaining a decision rather than a mechanism.

What they would **not** find: a `utils` folder, an `AbstractProviderFactoryBuilder`, a 900-line
service, a `handleRequest` function, a commented-out block, an `any`, or a single line explaining
what the line below it does.
