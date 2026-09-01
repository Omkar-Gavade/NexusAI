# 60–64 · Decisions, Risks, Review, Acceptance

Status: **CURRENT** · Risks and the ADR index. Individual records: [ADR-009](ADR-009-repository-structure.md) · [ADR-010](ADR-010-public-product-surface.md) · [ADR-011](ADR-011-tailwind-token-syntax.md) · [ADR-012](ADR-012-comparison-stays-inline.md)

## 60. MVP Exclusions

### 60.1 Not built, and genuinely absent

Excluded means **no stub, no placeholder, no disabled menu item, no empty module**. If the code does
not do it, the code does not mention it.

| Excluded | Why now | Where it would attach later |
|---|---|---|
| RAG / document retrieval | Requires ingestion, chunking, embeddings, a vector store, and citation UI — a product of its own | A `ContextProvider` port consumed by `CapabilityResolver` before candidate resolution |
| Long-term memory | Needs a retention model, a user-facing editing surface, and a privacy story | Same `ContextProvider` seam |
| Embeddings / vector DB | Only exists to serve RAG and memory | — |
| Agents / autonomous loops | Requires tools, a permission model, and step visibility | Orchestrator's attempt loop generalizes to a step loop |
| Tool calling | `toolCalling` is already a descriptor capability, so routing is ready; execution, permissioning, and result rendering are not | A `ToolExecutor` port called between provider chunks |
| Model comparison | Needs a second response lane, a diff surface, and doubled cost | A second `run()` invocation; the orchestrator is already per-request stateless |
| Multimodal input | `vision`/`audio`/`documents` capabilities exist and route correctly; upload, storage, and rendering do not | `AttachmentButton` is present and disabled with an explanatory tooltip — the only intentional disabled affordance in the product |
| Complex document processing | Same as RAG | — |
| Teams, sharing, collaboration | Requires a permission model beyond single-owner; every query filter would change | `userId` filters would become `ownerId` + membership; this is the one exclusion with real refactoring cost, and it is accepted |
| Enterprise admin, SSO, audit log | No customer requires it | — |
| Billing, quotas, usage dashboards | No monetization model defined | Metrics already record per-user request counts |
| Projects / folders | Grouping 40 conversations is not yet a problem; recency grouping plus search covers it | A `projectId` on conversations |
| Message editing | Changes conversation history semantics and invalidates downstream responses | — |
| Response version history | Regenerate deletes rather than versions; browsing versions needs a UI nobody asked for | — |
| Export / import | Not requested | — |
| Web search grounding | A capability flag away, but it is a provider feature with its own citation-honesty requirements | `grounding` capability + citation rendering |
| Voice input/output | Not requested | — |
| Kubernetes, microservices, service mesh, Kafka, CQRS, event sourcing | Explicitly forbidden as premature; two containers behind a load balancer is correct at this size | The provider platform is the only seam with a plausible extraction case |
| Account deletion, email change, password change | Real gaps, but each needs a verification flow to be safe. The data model supports deletion in three keyed deletes | — |
| Custom dashboards / in-app observability | Would be building the infrastructure dashboard the product definition rejects | External Grafana/Datadog |
| Distributed tracing | One service, one outbound call class — `requestId` correlation is sufficient | `request-context.ts` |
| Virtualized message list | Variable-height messages make virtualization actively harmful during streaming; pagination + `content-visibility` covers it | Revisit only if E13 exceeds its 200ms budget |
| Cross-process stream resume | Requires per-delta persistence or a Redis mirror plus a reaper, for the benefit of surviving a restart mid-response | Accepted risk R4 |
| Turborepo / Nx | Three packages | Revisit at ten |
| i18n | English only; `Intl` is used for dates and numbers so the formatting layer is already locale-correct | No hardcoded date or number strings to unwind |

### 60.2 The three extension seams that exist today

Only three, because [§70](#) of the brief warns against empty future modules. Each exists because it
is load-bearing **today**, and each happens to be where a future feature attaches:

1. **`ProviderAdapter`** — nine implementations today. New providers attach here.
2. **`CapabilityResolver` → `CandidateResolver`** — routing already reasons about capabilities today.
   RAG, memory, tools, and multimodal all enter as capability requirements.
3. **`ChatEvent` discriminated union** — six variants today. New event types (a `tool_call` event, a
   `citation` event) extend the union, and the compiler then requires every consumer to handle them.

No other extension point is pre-built. There is no `plugins/` directory, no `features/rag/` stub, no
`ToolRegistry` with zero tools.

---

## 61. Architectural Risks

Ordered by expected cost × likelihood. Each has a named mitigation and a named trigger for revisiting.

### R1 — Model catalog staleness *(high likelihood, medium impact)*

Providers deprecate and rename models frequently. A catalog entry pointing at a retired
`providerModelId` produces `MODEL_NOT_FOUND` at request time — a user-visible failure caused by our
own data being stale.

**Mitigation.** `providerModelId` is separate from our public `id`, so a rename is a one-line catalog
change with no user-visible effect. Health probes surface a dead model within one interval as
`CONFIGURED_BUT_UNAVAILABLE`, so Auto routes around it automatically rather than failing.
**Trigger.** Any `MODEL_NOT_FOUND` from a provider raises an alert; catalog review is a monthly
operational task.

### R2 — Weight tuning is subjective *(high likelihood, low impact)*

The five weight profiles encode opinions about which model is better for code. Nobody can prove them
optimal, and disagreement is inevitable.

**Mitigation.** Weights are data in one file, normalized by test, and every decision is logged with
its scores — so a complaint is investigable in one log line. The tiers are integers 1–5 precisely so
the argument is about a reviewable claim, not a fabricated decimal.
**Trigger.** Repeated user complaints about selection for a specific task class.

### R3 — Provider rate limits under concurrency *(medium likelihood, high impact)*

Several instances routing to the same top-ranked provider will hit that provider's rate limit before
hitting ours. Because `RATE_LIMIT` does not open the circuit breaker, requests keep arriving.

**Mitigation.** `RATE_LIMIT` applies a short per-provider cooldown that demotes the provider in
ranking, so load naturally spreads. Auto fails over on `RATE_LIMIT` to the next candidate.
**Residual risk.** With only one provider configured, there is nowhere to spread to; the user sees an
honest rate-limit message. This is accepted.
**Trigger.** `nexus_provider_errors_total{error_code="RATE_LIMIT"}` rising.

### R4 — Partial response loss on hard process death *(low likelihood, medium impact)*

Deltas live in process memory ([§24.3](../backend/architecture.md#243-persistence-during-streaming)). A SIGKILL or
OOM mid-stream loses the partial text and leaves the message `streaming`.

**Mitigation.** Graceful shutdown finalizes active streams; a startup sweep converts stale
`streaming` to `failed`; the read path never returns `streaming` to a client.
**Accepted cost.** One user loses one partial response during an unplanned instance death.
**Trigger.** More than a handful of sweep conversions per week means the real problem is instability,
not persistence strategy.

### R5 — SSE buffering by intermediaries *(medium likelihood, high impact)*

A proxy or CDN that buffers the response makes perfect streaming look completely broken.

**Mitigation.** `X-Accel-Buffering: no`, `Cache-Control: no-transform`, 15s heartbeat, and an explicit
Phase 7 acceptance item verifying streaming through the real production proxy.
**Trigger.** Any report of "the response appears all at once."

### R6 — Argon2 native binding portability *(low likelihood, high impact)*

`@node-rs/argon2` is a native binding. A platform without a prebuilt binary breaks the boot.

**Mitigation.** Verified inside the actual Docker image in Phase 0, before anything depends on it.
Fallback is `argon2` (node-gyp) with identical parameters — hashes are interoperable because the
parameters are encoded in the hash string.

### R7 — The 15-minute access-token revocation window *(certain, low impact)*

Logout revokes the refresh family immediately, but the access token remains valid until it expires.

**Mitigation.** 15-minute lifetime bounds the window. Documented explicitly rather than papered over.
**Why accepted.** Immediate revocation requires a per-request denylist lookup, converting a stateless
token into a stateful one and removing the entire reason for using a JWT.
**Trigger.** A requirement for immediate session termination (enterprise, compliance) — at which
point the access token becomes an opaque Redis-backed token and the trade reverses.

### R8 — Teams would require touching every query *(low likelihood now, high cost if needed)*

Every query filters by `userId`, and `userId` is denormalized onto messages. Introducing shared
ownership means changing that filter everywhere and backfilling.

**Mitigation.** None attempted, deliberately. Building a membership model now would add a join to
every hot-path query to serve a requirement that does not exist.
**Trigger.** A concrete multi-user requirement. The refactor is mechanical and greppable — the
authorization pattern being uniform is exactly what makes it tractable.

### R9 — Redis single point of partial failure *(medium likelihood, medium impact)*

Sessions, rate limits, health, and breakers all live in Redis.

**Mitigation.** The seven per-subsystem degradation policies in
[§40.2](../architecture/security-operations.md#402-degradation-policy--per-subsystem-deliberately-different), each
individually tested. Users with a valid access token keep working through a full Redis outage.
**Trigger.** `nexus_redis_degradations_total` non-zero.

### R10 — Orchestrator complexity growth *(medium likelihood, medium impact)*

The orchestrator is where every future feature will want to add a step.

**Mitigation.** A 200-line ceiling as a Phase 3 acceptance criterion, and six pure collaborators that
new policy must move into rather than accreting in the loop.
**Trigger.** Any PR pushing `orchestrator.ts` past 200 lines.

---

## 62. ADR Recommendations

Eight records, written in Phase 7, each with context · decision · alternatives · reasoning ·
consequences.

| ADR | Title | Core decision | Principal alternative rejected |
|---|---|---|---|
| **001** | Modular monolith | One deployable, boundaries by lint. Provider platform is the only pre-isolated seam | Microservices per domain — network hops and deployment surface for a system with one team and no independent scaling need |
| **002** | MongoDB with the official driver | Three collections, driver not ODM, no migration framework | Mongoose (duplicates our Zod schema, hides queries); PostgreSQL (relational integrity we do not need for an append-mostly message log) |
| **003** | SSE over `fetch` streaming | Server writes SSE frames; client parses with `ReadableStream`, not `EventSource` | `EventSource` (no POST body, no custom headers, unreliable cancellation, unwanted auto-reconnect); WebSockets (bidirectional protocol for a unidirectional problem) |
| **004** | Provider adapter over direct HTTP | One narrow interface, `stream()` only, nine adapters, no vendor SDKs | Vendor SDKs (eight dependency trees, eight retry policies we cannot see, each wanting to own the streaming loop) |
| **005** | Deterministic Auto routing | Pure weighted scoring over integer tiers, hard filters first, unique-`rank` tie-break | LLM-based routing (latency and cost on every request, a failure mode before work starts, untestable); random/round-robin (no quality reasoning); single hardcoded default (not a multi-model product) |
| **006** | Redis for coordination only | Sessions, rate limits, health, breakers, idempotency. Never a cache of user data, never the only copy of anything | Redis as a message cache (invalidation bugs for no measured gain); no Redis (no revocable sessions, no shared breaker, no distributed rate limit) |
| **007** | httpOnly cookie sessions with rotating refresh | Stateless 15-min Ed25519 access token + opaque revocable refresh token with family reuse detection | `localStorage` tokens (readable by any XSS); stateless refresh (unrevocable); server sessions only (a Redis read on every request) |
| **008** | Shared Zod contracts package | Schemas are the source of truth; TS types inferred; validation at both boundaries, response validation dev-only | Duplicated types (guaranteed drift); OpenAPI codegen (a build step and a generated-code review problem for three packages) |

Two further records are worth writing if the questions recur: **009 — No SSR** and
**010 — No virtualization**. Both are argued in this specification
([§18.2](../frontend/architecture.md#182-rendering-and-transport-model),
[§46.4](../architecture/quality.md#464-long-conversations)) and both will be asked about.

---

## 63. Final Architecture Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                                             │
│                                                                                      │
│  AppShell ─ Sidebar ─ ConversationView ─ Composer ─ ModelSelector                    │
│      │                       │                │            │                         │
│      │      TanStack Query   │   useChatStream│            │ useModels               │
│      │   session/conversations/messages/models│            │                         │
│      │                       │      stream-reducer (pure)  │                         │
│      └──── Zustand: ui-store, theme-store (4 values total) ┘                         │
│                              │                                                       │
│                       lib/http.ts  ·  lib/sse.ts                                     │
└──────────────────────────────┬───────────────────────────────────────────────────────┘
                               │ HTTPS · httpOnly cookies · X-Nexus-Client
                               │ fetch POST → text/event-stream
┌──────────────────────────────▼───────────────────────────────────────────────────────┐
│  API — Fastify modular monolith                                                      │
│                                                                                      │
│  helmet → cors → cookie → rateLimit → requestId → authenticate → csrf → errorHandler │
│                                                                                      │
│  ┌── HTTP ─────────────────────────────────────────────────────────────────────────┐ │
│  │ auth/routes  conversations/routes  messages/routes  models/routes  chat/routes   │ │
│  │                                                              (+ sse-writer)      │ │
│  └────────────────────────────────┬────────────────────────────────────────────────┘ │
│                                   │ services                                         │
│  ┌── DOMAIN (pure — no mongodb, ioredis, fastify, undici, pino) ───────────────────┐ │
│  │                                                                                  │ │
│  │   ChatOrchestrator ──┬── TaskClassifier        (pure)                            │ │
│  │   (attempt loop,     ├── CapabilityResolver    (pure)                            │ │
│  │    event emission,   ├── CandidateResolver     (pure)  ← excludes testOnly        │ │
│  │    finalization)     ├── ModelRanker           (pure)  ← deterministic scoring    │ │
│  │                      ├── FailoverManager       (pure)  ← token-boundary rule      │ │
│  │                      └── RoutingRecorder                                          │ │
│  │                                                                                  │ │
│  │   User · Conversation · Message · ModelDescriptor · Availability · AppError       │ │
│  │   Ports: UserRepository · ConversationRepository · MessageRepository ·            │ │
│  │          ProviderAdapter · Clock                                                  │ │
│  └────────────────────────────────┬────────────────────────────────────────────────┘ │
│                                   │ implements                                       │
│  ┌── INFRASTRUCTURE ──────────────▼────────────────────────────────────────────────┐ │
│  │  mongodb/           redis/                providers/                             │ │
│  │   user-repo          session-store         registry · catalog                     │ │
│  │   conversation-repo  rate-limiter          health-service (probe + breaker)       │ │
│  │   message-repo       health-store          http-client (undici pools)             │ │
│  │   indexes                                  adapters ×9  ← ONLY place with         │ │
│  │   startup-sweep                                          provider-specific code   │ │
│  │  observability/ logger (redaction) · metrics                                      │ │
│  └──────┬──────────────────┬───────────────────────────┬──────────────────────────┘ │
└─────────┼──────────────────┼───────────────────────────┼────────────────────────────┘
          │                  │                           │  egress only — never browser
    ┌─────▼─────┐      ┌─────▼─────┐         ┌───────────▼────────────────────────┐
    │  MongoDB  │      │   Redis   │         │  Google · OpenAI · Anthropic ·     │
    │           │      │           │         │  Mistral · DeepSeek · Groq ·       │
    │ users     │      │ sessions  │         │  OpenRouter · NVIDIA               │
    │ convos    │      │ ratelimit │         │  (+ Mock — dev only, testOnly)     │
    │ messages  │      │ health    │         └────────────────────────────────────┘
    └───────────┘      │ breakers  │
                       │ idem      │
                       └───────────┘

packages/contracts — Zod schemas + inferred types, imported by BOTH sides. One definition, no drift.
```

### 63.1 Request path for one message, end to end

```text
Enter in composer
  → optimistic user message rendered                                        (client)
  → POST /api/chat/stream, AbortController armed                            (client)
  → helmet/cors/cookie/rateLimit/requestId/authenticate/csrf                (api)
  → Zod parse against ChatRequest                                           (api)
  → conversation ownership as a query filter, or create                     (api)
  → persist user message; persist assistant message as `streaming`          (api)
  → TaskClassifier → CapabilityResolver → CandidateResolver                 (domain, pure)
  → AvailabilityResolver annotates; unroutable filtered                     (domain, pure)
  → ModelRanker scores; deterministic winner                                (domain, pure)
  → emit START                                                              (api → client)
  → adapter.stream() → provider REST, undici pool, signal attached          (infra)
  → chunks → emit DELTA, backpressure-aware                                 (api → client)
  → first token → emit METADATA (firstTokenMs, failover?)                   (api → client)
  → RAF-coalesced render, block-memoized markdown                           (client)
  → provider finishes → persist content + status + metadata (one write)     (api)
  → bump conversation updatedAt, messageCount, lastModel                    (api)
  → emit COMPLETE → attribution line renders, composer refocuses            (client)
  → RoutingRecorder logs candidates, scores, selection, exclusions          (api)
```

---

## 63.2 Critical review before coding

Performed against the categories the brief requires. Findings are recorded with their resolution, so
this section is a record of the review, not a claim that none was needed.

### Architecture

| Finding | Resolution |
|---|---|
| Circular dependency risk between orchestrator and availability | Availability is resolved **before** the orchestrator's loop and passed in as values; the orchestrator does not call back into resolution. Enforced by the pure-collaborator design |
| Provider leakage into ranking | Ranking consumes only `ModelDescriptor` fields. No provider identifier reaches `domain/chat/`. Lint rule + grep test |
| Unclear ownership of the model catalog | Single owner: `infrastructure/providers/catalog.ts`. Not in Mongo, not in the frontend, not duplicated |
| `generate()` + `stream()` would be two divergent paths | `generate()` removed from the adapter contract entirely (§26.1) |
| `getCapabilities()` duplicates `ModelDescriptor` | Removed. Capabilities are a model property, one source of truth |
| A DI container would hide the object graph | Rejected in favor of a 60-line composition root |

### Frontend

| Finding | Resolution |
|---|---|
| Per-token React state would freeze the composer | RAF coalescing + block-memoized markdown, specified in Phase 4 with an asserted budget, not deferred to optimization |
| Model-selector Enter could submit the chat | Listbox portals and holds focus; the composer checks `event.target` identity; asserted by an E2E test |
| Streaming live region would flood a screen reader | `aria-busy` during streaming, announcement only on completion, with attribution |
| Auto-scroll would yank users away from text they are reading | 64px threshold disengages auto-follow; `Jump to latest` appears |
| Hover-only message actions exclude keyboard users | Actions are always in the tab order regardless of opacity |
| Light mode as an inversion would look wrong | Independently designed, with three named structural differences and separately chosen status hues |
| A blue primary button fails contrast at 3.23:1 | Inverted neutral fill at 16.24:1 / 17.96:1, which is also more restrained |
| `text-muted` failed AA on hovered rows | Retuned to `#8A909C` / `#676D77` and verified at 5.11 / 4.56 |
| Virtualization would cause scroll jumping | Rejected with reasoning; pagination + `content-visibility`, with a measured trigger to revisit |

### Backend

| Finding | Resolution |
|---|---|
| Authorization as a separate check can be forgotten | Ownership is a query filter; a repository scan test fails the build if `userId` is missing |
| `403` leaks resource existence | All ownership failures return `404` |
| `req.body.userId` could be trusted | The field does not exist in any schema, so it is stripped before a handler can see it |
| A message could be left `streaming` forever | Idempotent `finally` finalization + graceful-shutdown finalization + startup sweep + read-path mapping |
| Failover after the first token would splice two models | Hard rule at the token boundary, with the single most important test in the suite asserting it |
| An adapter retrying internally would make the budget a lie | Adapters must not retry; retry is `FailoverManager`'s alone |
| Inter-token stalls would hang until the total timeout | Separate inter-token idle timeout (20s) |
| Slow clients would grow memory unboundedly | `write()` return value checked, `drain` awaited, lazy pull from the provider iterable |
| "Fail open" for all of Redis would be an auth bypass | Per-subsystem policy table: sessions and auth rate limits fail **closed** |
| A 4th collection for sessions would need its own expiry sweep | Sessions live in Redis with native TTL |

### Product

| Finding | Resolution |
|---|---|
| `POST /conversations` would create empty conversations | Removed; creation is a side effect of the first message |
| A second LLM call for titling would be hidden cost and latency | Server-side derivation from the first message |
| Hiding unavailable models makes the product feel smaller and hides the reason | Listed, disabled, annotated with a reason |
| Exposing tier scores turns a calm product into a configuration surface | Tiers and `rank` are omitted from the API |
| A failover notice shown speculatively destroys its credibility | Rendered only when a failover actually occurred |
| Discarding partial text on Stop destroys work the user read | Partial always retained and persisted |
| `UNKNOWN` blocking routing would produce a false "no models available" on every cold start | `UNKNOWN` is routable with a 0.85 penalty |
| An empty `settings` page would be scope for its own sake | Four controls in a modal route |

### Code quality

| Finding | Resolution |
|---|---|
| `utils/helpers/common/misc` drift | `lib/` capped at five named files, each requiring ≥2 consumers; forbidden filenames enumerated |
| A 1,000-line orchestrator | Six pure collaborators own every decision; 200-line ceiling as an acceptance criterion |
| An `AppError` subclass hierarchy | One class, codes as data, flags as behavior, named factories |
| A generic `Repository<T>` base | Three concrete repositories with the queries they actually run |
| Barrel files breaking tree-shaking | Banned except the contracts package's explicit named re-exports |
| An animation library for eleven transitions | Rejected; CSS only |
| A component library contradicting an original design language | Rejected |
| Speculative future modules | Three extension seams, each load-bearing today; no empty directories |

---

## 64. Final Acceptance Criteria

The specification is complete when every box below can be checked. Implementation begins only after
approval.

### Specification completeness

```text
[ ] All 64 sections of the required output structure are present and specific
[ ] Every color pair is verified by computation, not asserted
[ ] Every dependency has a written justification and a stated alternative
[ ] Every excluded feature has a reason and a named future attachment point
[ ] Every phase has objective, dependencies, files, interfaces, tests, acceptance criteria, risks,
    and both manual and automated verification
[ ] Every architectural risk has a mitigation and a revisit trigger
[ ] Eight ADRs are identified with their rejected alternatives
```

### The six product rules, provable

```text
[ ] Rule 1 — REAL AI.  No timer appears in the streaming path (asserted). No metadata is estimated.
              Token counts are null when unreported rather than approximated.
[ ] Rule 2 — REAL MULTI-MODEL.  The provider abstraction lands in Phase 2, before any chat endpoint.
              Nine adapters behind one interface. Adding a provider is one file plus one catalog row.
[ ] Rule 3 — AUTO NEVER USES MOCK.  Three independent server-side guards, one property test, one
              1,000-iteration test, and E2E specs E3/E4/E5.
[ ] Rule 4 — USER ISOLATION.  Ownership is a query filter, not a check. 404 not 403. A repository
              scan test fails the build on a query missing userId.
[ ] Rule 5 — SECRETS NEVER REACH THE BROWSER.  Six containment layers, a CI bundle scan, and
              connect-src 'self' making it structurally impossible.
[ ] Rule 6 — HONEST UI.  Every displayed value is measured. Failover notices appear only on real
              failover. `streaming` is never shown as `complete`.
```

### The three tests from the brief

```text
[ ] DESIGN TEST — With all gradients, animation, shadows, and illustration removed, is NexusAI still
    premium?  YES, by construction: the design is one typeface at seven sizes, three text colors,
    four surfaces, one accent, hairline borders, and an 8px grid. Nothing decorative is load-bearing.

[ ] CODE TEST — Would an experienced engineer recognize this as clean, intentional production code?
    YES: three collections, five files in lib/, one error class, six pure collaborators, nine
    single-purpose adapters, four values of global client state, eleven animations, ~one comment per
    fifty lines each explaining a decision. No utils folder, no factory for one object, no `any`.

[ ] PRODUCT TEST — Must the user understand the AI infrastructure to use NexusAI?
    NO: Auto is preselected, the composer is focused on load, and the only infrastructure the user
    ever sees is one muted attribution line — plus one plain sentence when, and only when, something
    unexpected happened.
```

### MVP feature completeness

Each item must be real, not stubbed.

```text
[ ] 1  Authentication — register, login, logout, sessions, rotation, reuse detection
[ ] 2  New chat
[ ] 3  Persistent conversations
[ ] 4  Real multi-model support
[ ] 5  Auto routing — deterministic, logged, tested
[ ] 6  Manual model selection — authoritative, never substituted
[ ] 7  Model switching mid-conversation
[ ] 8  Real streaming — SSE, incremental, no timers
[ ] 9  Markdown — GFM
[ ] 10 Code blocks — language, copy, horizontal scroll
[ ] 11 Tables — scrollable on mobile
[ ] 12 Copy — message and code block
[ ] 13 Regenerate
[ ] 14 Rename — inline, optimistic, rollback
[ ] 15 Delete — confirmed, cascading, rollback
[ ] 16 Responsive — 375 / 390 / 768 / 1024 / 1440, behavior specified per breakpoint
[ ] 17 Light and dark — independently designed
[ ] 18 Provider and model availability — seven states, real health data
[ ] 19 Failover — real, bounded, disclosed, never after the first token
[ ] 20 Production-grade error handling — 26 codes, three representations, one mapping point
```

### Quality gates

```text
[ ] pnpm verify green
[ ] domain/ coverage ≥95%; per-area thresholds met
[ ] E1–E15 pass on Chromium and WebKit
[ ] axe: zero serious/critical on every route × theme × state
[ ] Entry bundle ≤180KB gzipped
[ ] Keystroke-to-paint <32ms while streaming
[ ] No horizontal overflow at any specified breakpoint
[ ] Touch targets ≥44×44 below 1024px
[ ] pnpm audit --audit-level=high clean
[ ] No provider identifier in the frontend source
[ ] No `if (provider === ...)` outside adapters
[ ] No `dangerouslySetInnerHTML` anywhere
[ ] No `any`; no `TODO` without an issue; no commented-out code
[ ] Streaming verified through the real production proxy
```

### Approval

```text
[ ] Specification reviewed
[ ] Specification approved
[ ] Phase 0 may begin
```

**Do not begin implementation until the boxes above are checked.**
