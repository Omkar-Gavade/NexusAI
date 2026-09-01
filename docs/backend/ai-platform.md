# 25–34 · AI Platform

> **PLANNED — NOT IMPLEMENTED.** No orchestrator, provider adapter, registry or
> health prober exists. This also describes v1.0 single-model routing; v2.0
> fans out to several models in parallel and adds a synthesis pass. The
> provider abstraction, availability states and failover rules remain the
> intended design; the routing chapter is superseded.


This is the part of NexusAI that justifies its existence. Everything here is designed before any of
it is written.

## 25. Provider Architecture

### 25.1 Why HTTP, not vendor SDKs

Eight providers means eight SDKs, eight release cadences, eight opinionated retry policies we cannot
see, eight abort implementations of varying quality, and roughly 2–4MB of transitive dependencies.
More importantly, every SDK wants to own the streaming loop — which is exactly the loop we must
control for cancellation and failover correctness.

**Decision: all adapters call provider REST endpoints directly through a shared `undici` pool.**

Each adapter is then ~120–180 lines: build the request body, POST it, parse the response stream,
map errors. The provider's own streaming format is parsed by a shared SSE parser plus a per-provider
delta extractor. We own timeouts, we own aborts, we own retries, and the dependency surface is one
HTTP client.

The exception clause is written into the spec now so it is a decision rather than a drift: an SDK
may be adopted for a specific provider **only** if that provider's auth requires signed requests
that would be error-prone to hand-roll. None of the eight MVP providers do.

### 25.2 Provider inventory

| Provider | Adapter | Endpoint shape | Notes |
|---|---|---|---|
| Google | `gemini.ts` | `:streamGenerateContent?alt=sse` | Different message schema (`contents`/`parts`), system prompt is a separate field |
| OpenAI | `openai.ts` | `/v1/chat/completions` | The de-facto format |
| Anthropic | `anthropic.ts` | `/v1/messages` | Distinct event types (`content_block_delta`), system prompt is top-level |
| Mistral | `mistral.ts` | `/v1/chat/completions` | OpenAI-compatible |
| DeepSeek | `deepseek.ts` | `/v1/chat/completions` | OpenAI-compatible; reasoning models emit a separate reasoning field |
| Groq | `groq.ts` | `/openai/v1/chat/completions` | OpenAI-compatible; very low latency, strict rate limits |
| OpenRouter | `openrouter.ts` | `/api/v1/chat/completions` | OpenAI-compatible aggregator; requires attribution headers |
| NVIDIA | `nvidia.ts` | `/v1/chat/completions` | OpenAI-compatible |
| Mock | `mock.ts` | none | `testOnly: true`. Deterministic token emission with a configurable delay |

Six of nine are OpenAI-compatible, so `openai.ts` exposes a small reusable request/parse core that
`mistral`, `deepseek`, `groq`, `openrouter`, and `nvidia` compose. That sharing is justified by five
real consumers today — it is not speculative abstraction. Gemini and Anthropic implement the
interface independently because their wire formats genuinely differ.

### 25.3 Development can start with one provider

`buildAdapters()` constructs an adapter only for providers with a configured key. With only
`GEMINI_API_KEY` set, the system runs end to end: registry filters to Gemini models, availability
marks the rest `NOT_CONFIGURED`, routing ranks a single candidate, failover finds no alternative and
reports honestly. Adding a second provider later is one new file plus one catalog entry — no change
to the orchestrator, the routes, or the frontend.

### 25.4 The rule against provider leakage

`if (provider === 'gemini')` may not appear outside `infrastructure/providers/adapters/`. Enforced
by an ESLint `no-restricted-syntax` rule matching comparisons against known provider identifiers in
`domain/**` and `modules/**`, and by a test that greps for provider names outside the adapter
directory and the catalog.

Provider-specific behavior is expressed as **data on the model descriptor**, not as branches in
application code. If Anthropic requires a system prompt in a different position, that is the
Anthropic adapter's problem and nobody else's.

---

## 26. Provider Adapter Contract

```ts
// domain/ports.ts — pure, no I/O imports

interface ProviderAdapter {
  readonly info: ProviderInfo;

  /** Models this adapter can serve, filtered to those the registry knows. */
  listModels(): ModelDescriptor[];

  /** Cheapest possible liveness probe. Must not consume meaningful quota. */
  healthCheck(signal: AbortSignal): Promise<HealthResult>;

  /** Streaming generation. The ONLY generation entry point. */
  stream(request: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderChunk>;
}

type ProviderInfo = {
  id: string;                 // 'google' | 'openai' | …
  displayName: string;        // 'Google'
  testOnly: boolean;          // true only for mock
};

type GenerationRequest = {
  modelId: string;
  messages: ChatTurn[];       // provider-neutral
  system: string | null;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
};

type ChatTurn = { role: 'user' | 'assistant'; content: string };

type ProviderChunk =
  | { type: 'text';  text: string }
  | { type: 'usage'; inputTokens: number | null; outputTokens: number | null }
  | { type: 'finish'; reason: FinishReason };

type HealthResult =
  | { ok: true;  latencyMs: number }
  | { ok: false; error: AppError };
```

### 26.1 Why `stream()` is the only generation method

The brief lists both `generate()` and `stream()`. **`generate()` is deliberately omitted.**
Non-streaming generation would be `stream()` with the chunks concatenated — a three-line helper, not
an interface method. Two methods means every adapter implements two code paths, two error surfaces,
and two sets of tests, and they will drift. Since streaming is mandatory for the product, streaming
is the primitive. `collect(stream)` exists as a four-line function in the orchestrator's test
helpers.

Similarly, `getCapabilities()` is omitted: capabilities are properties of a **model**, not of a
provider, and they already live on `ModelDescriptor`. An adapter-level capabilities method would be
a second, divergent source of truth for the same fact.

### 26.2 Adapter obligations

Every adapter must:

1. **Propagate the `AbortSignal`** to its underlying request. When aborted, stop iterating promptly
   and release the socket. Verified by an integration test asserting the upstream connection closes
   within 100ms of abort.
2. **Never throw raw upstream errors.** Every failure is converted to an `AppError` with a
   classified `code`. The upstream body is attached to the log context, never to the user-facing
   message.
3. **Never retry internally.** Retry is a policy decision owned by `FailoverManager`. An adapter
   that retries silently makes the orchestrator's attempt budget a lie.
4. **Emit `usage` when the provider reports it, and not otherwise.** No estimation.
5. **Be stateless.** No caching, no accumulated conversation state. One adapter instance serves all
   concurrent requests.
6. **Enforce its own timeout** using the request's `timeoutMs`, distinguishing connect timeout from
   inter-token idle timeout (a stream that stalls after 40 tokens must fail, and the default socket
   timeout will not catch it).

### 26.3 Health check design

`healthCheck()` uses each provider's cheapest authenticated endpoint — a models-list call where one
exists, otherwise a 1-token generation. It runs with a 5s timeout and a dedicated `undici` pool so a
saturated generation pool cannot starve probes.

The mock adapter's health check always returns `ok`, and the mock adapter is excluded from the
health scheduler in production entirely.

---

## 27. Model Registry

### 27.1 `ModelDescriptor`

```ts
type ModelDescriptor = {
  id: string;                       // 'gemini-2.5-flash' — stable public identifier
  provider: string;                 // 'google'
  providerModelId: string;          // the id the provider's API actually expects
  displayName: string;              // 'Gemini 2.5 Flash'
  description: string;              // one sentence, shown in the selector
  contextWindow: number;            // input tokens
  maxOutputTokens: number;

  capabilities: {
    reasoning: boolean;
    vision: boolean;
    audio: boolean;
    video: boolean;
    documents: boolean;
    toolCalling: boolean;
  };

  speedTier:   1 | 2 | 3 | 4 | 5;   // 5 = fastest
  qualityTier: 1 | 2 | 3 | 4 | 5;   // 5 = strongest
  costTier:    1 | 2 | 3 | 4 | 5;   // 5 = cheapest
  reliabilityTier: 1 | 2 | 3 | 4 | 5;

  rank: number;                     // deterministic tie-break, unique across the catalog
  deprecated: boolean;
  testOnly: boolean;
};
```

`providerModelId` is separate from `id` so a provider renaming a model does not change our public
identifier, and so an OpenRouter-proxied model can carry a namespaced upstream id while keeping a
clean local one.

Tiers are **1–5 integers, not floating-point scores**. Integers are reviewable, diffable, and
arguable in a PR. A `qualityScore: 0.873` invites false precision nobody can justify.

`rank` exists solely to make ties deterministic (§30.5). It is unique, and a test asserts uniqueness.

### 27.2 Catalog location and shape

The catalog is a **typed TypeScript constant** in
`infrastructure/providers/catalog.ts`, not a database collection and not a JSON file.

- Not a DB collection: it is code-shaped data that changes with deployments, needs code review, and
  must be identical across instances. Putting it in Mongo means a mutable production surface with no
  review trail.
- Not JSON: TypeScript gives compile-time validation of the shape, and the file is validated against
  a Zod schema at boot regardless, so a malformed entry fails the process rather than a request.

The frontend **never** contains model names. `GET /api/models` returns the catalog joined with live
availability. A test asserts that no string matching a known model or provider identifier appears in
`frontend/src/**` outside of test fixtures.

### 27.3 Registry responsibilities

```ts
class ModelRegistry {
  get(modelId: string): ModelDescriptor | null;
  list(): ModelDescriptor[];                          // all, including unconfigured
  listConfigured(): ModelDescriptor[];                // provider key present
  listRoutable(): ModelDescriptor[];                  // configured, not deprecated, NOT testOnly
}
```

`listRoutable()` is the **first** of three independent guards that keep Mock out of Auto. It filters
`testOnly` unconditionally — there is no parameter to disable that filter, so no future call site
can accidentally opt in.

---

## 28. Model Availability

### 28.1 The seven states

| State | Meaning | Determined by | Routable in Auto? | UI |
|---|---|---|---|---|
| `AVAILABLE` | Recent successful probe, breaker closed | health snapshot `ok`, age < 180s | Yes | Selectable, no annotation |
| `UNKNOWN` | Configured; no probe result yet (cold start, or Redis down) | no snapshot | **Yes, with a scoring penalty** | Selectable, no annotation |
| `TEMPORARILY_UNAVAILABLE` | Circuit breaker open after repeated failures | breaker state `open` | No | Listed, disabled, `Temporarily unavailable` |
| `CONFIGURED_BUT_UNAVAILABLE` | Key present but authentication or account-level failure | last probe `AUTH_ERROR` or `PROVIDER_ERROR` ≥3 consecutive | No | Listed, disabled, `Unavailable` |
| `NOT_CONFIGURED` | No API key in the environment | config | No | Listed, disabled, `Not configured` |
| `DISABLED` | Explicitly turned off by operator config | `DISABLED_MODELS` env | No | Hidden from the selector entirely |
| `DEPRECATED` | Retired by us | `descriptor.deprecated` | No | Hidden unless it is the user's saved default, in which case shown as `No longer available` |

### 28.2 Why `UNKNOWN` is routable

If `UNKNOWN` blocked routing, then every cold start — a deploy, a scale-up, a Redis flush — would
produce "No real models are currently available" for up to 60 seconds, even though every provider is
perfectly healthy. That is a false negative presented to the user as fact, which is its own honesty
violation.

Instead `UNKNOWN` is routable with a `0.85` multiplier on the availability component of the score,
so a known-healthy model is always preferred when one exists, and an unprobed model is used rather
than failing. The first real request then produces real health data.

### 28.3 Health probing

```text
Scheduler: every 60s, per configured provider (jittered ±10s to avoid thundering herd)
  → adapter.healthCheck(signal, 5s timeout)
  → write snapshot to Redis: provider:health:{providerId}
      { ok, latencyMs, checkedAt, consecutiveFailures, error? }  TTL 180s
  → update circuit breaker state
```

Only **one instance probes**, guarded by a Redis lock (`SET provider:health:lock:{id} NX PX 55000`).
Without the lock, ten instances would produce ten times the probe traffic and could trip provider
rate limits — a self-inflicted outage.

Snapshot TTL (180s) is three probe intervals, so two missed probes are tolerated before a provider
falls back to `UNKNOWN` rather than being wrongly marked unavailable.

### 28.4 Circuit breaker

Per provider, not per model — a provider outage affects all its models.

```text
CLOSED   → normal. Failures counted in a 60s sliding window.
           5 failures, or 3 consecutive → OPEN

OPEN     → not routable. 30s cooldown, doubling to a 300s ceiling on
           repeated reopening. → HALF_OPEN after cooldown

HALF_OPEN→ exactly one probe or one real request permitted.
           success → CLOSED, counters reset, cooldown reset
           failure → OPEN, cooldown doubled
```

Only failures that indicate provider unhealth move the breaker: `TIMEOUT`, `NETWORK_ERROR`,
`PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR`. **`RATE_LIMIT` does not open the breaker** — it means we
are asking too fast, not that the provider is broken; it applies a short per-provider cooldown
instead. `CONTENT_POLICY` and `INVALID_REQUEST` never affect the breaker; they are our fault or the
prompt's.

Breaker state lives in Redis so all instances share it. If Redis is unavailable the breaker degrades
to per-instance in-memory state, which is less effective but never blocks requests.

### 28.5 Resolution is pure

```ts
// domain/availability.ts — pure function, no I/O, exhaustively unit-tested
function resolveAvailability(
  descriptor: ModelDescriptor,
  health: HealthSnapshot | null,
  breaker: BreakerState | null,
  config: ProviderConfig,
  now: Date,
): Availability
```

Resolution order (first match wins): `DISABLED` → `DEPRECATED` → `NOT_CONFIGURED` →
breaker open ⇒ `TEMPORARILY_UNAVAILABLE` → snapshot missing or expired ⇒ `UNKNOWN` →
snapshot failing with auth/provider error ⇒ `CONFIGURED_BUT_UNAVAILABLE` → snapshot ok ⇒ `AVAILABLE`.

---

## 29. Chat Orchestrator

### 29.1 Pipeline

```text
ChatRequest
    │
    ▼  validate (Zod, shared contract)
    ▼  authorize (conversation ownership)
    ▼  TaskClassifier          → TaskClass
    ▼  CapabilityResolver      → required capabilities + token budget
    ▼  CandidateResolver       → ModelDescriptor[]  (registry.listRoutable ∩ capabilities ∩ context)
    ▼  AvailabilityResolver    → annotate + filter unroutable
    ▼  ModelRanker             → RankedModel[]      (deterministic scores)
    ▼  ProviderSelector        → attempt order
    ▼  ┌──────────────────────────────────────────┐
       │  attempt: adapter.stream()               │◄──┐
       │    ok → emit chunks                      │   │ FailoverManager
       │    fail → classify → retry? next? stop?  │───┘  (budget-limited)
       └──────────────────────────────────────────┘
    ▼  RoutingRecorder         → structured log + metadata on the message
    ▼  persist + emit terminal event
```

### 29.2 Collaborators — each small, each testable alone

| Class | Responsibility | Purity | ~Lines |
|---|---|---|---|
| `ChatOrchestrator` | Sequence the pipeline, own the attempt loop, emit events | impure (I/O via ports) | ~200 |
| `TaskClassifier` | Text → `TaskClass` | **pure** | ~70 |
| `CapabilityResolver` | Task + attachments → required capabilities + token budget | **pure** | ~50 |
| `CandidateResolver` | Registry + requirements → eligible descriptors | **pure** | ~60 |
| `ModelRanker` | Candidates + context + weights → scored, sorted | **pure** | ~90 |
| `FailoverManager` | Should we retry? same model or next? budget left? | **pure** | ~80 |
| `RoutingRecorder` | Emit the decision as structured log + message metadata | impure (logger) | ~40 |

Six of the seven are pure functions of their inputs. The orchestrator is the only component that
touches I/O, and it contains no policy — every decision is delegated. This is how a 1,000-line
orchestrator is avoided: not by splitting a big file, but by moving every *decision* out of it.

### 29.3 Task classification — deterministic, not LLM-based

Calling an LLM to decide which LLM should answer adds latency to every request, adds a failure mode
before any work starts, costs money per request, and produces non-deterministic behavior that cannot
be unit-tested. It is rejected for MVP.

Classification is a small set of ordered rules over the latest user message:

```text
1. hasAttachments                                     → MULTIMODAL   (post-MVP; capability gate only)
2. fenced code block, or ≥2 code-ish tokens¹          → CODE
3. explicit reasoning trigger²                        → REASONING
4. estimated input tokens > 8000                      → LONG_CONTEXT
5. message length < 200 chars and ends with '?'       → SHORT_ANSWER
6. otherwise                                          → GENERAL
```

¹ `function`, `class`, `const`, `=>`, `def `, `import `, `SELECT `, `#include`, `</`, `npm `, `git `
² leading `explain why`, `compare`, `analyze`, `prove`, `derive`, `step by step`, `trade-offs`

The rules are ~40 lines, fully unit-tested with a fixture table of ~50 inputs, and every result is
reproducible. They are also **deliberately coarse**: the ranking weights do the real work, and a
misclassification degrades to a slightly different weighting, never to a broken request.

Estimated token counts use a `chars / 4` heuristic. This is an internal budgeting number used only
for candidate filtering — it is **never displayed to the user as a token count**, which keeps Rule 6
intact.

---

## 30. Auto Routing

### 30.1 Hard filters (applied before scoring)

A model is a candidate only if **all** hold:

1. `registry.listRoutable()` — configured, not deprecated, **not `testOnly`**
2. Availability ∈ {`AVAILABLE`, `UNKNOWN`}
3. Every required capability is `true` on the descriptor
4. `estimatedInputTokens + reservedOutput ≤ contextWindow`
5. Not already attempted in this request

If the candidate set is empty, the orchestrator does **not** invent a fallback. It fails with
`NO_MODEL_AVAILABLE` and the UI shows `No real models are currently available.`

### 30.2 Scoring

All components are normalized to `[0, 1]` as `(tier − 1) / 4`.

```text
score = w_quality     × quality
      + w_speed       × speed
      + w_cost        × cost
      + w_reliability × reliability
      + w_preference  × preferenceBonus
      
final = score × availabilityMultiplier
```

`availabilityMultiplier`: `AVAILABLE = 1.00`, `UNKNOWN = 0.85`.
`preferenceBonus`: `1.0` if the model is the user's saved default or was used in this conversation's
last turn, else `0`. Conversation stickiness matters — switching models mid-conversation changes
voice and style, and users notice.

### 30.3 Weight profiles per task class

| Task class | quality | speed | cost | reliability | preference | Reasoning |
|---|---|---|---|---|---|---|
| `SHORT_ANSWER` | 0.20 | 0.40 | 0.15 | 0.15 | 0.10 | Latency dominates perceived quality for a one-line answer |
| `GENERAL` | 0.35 | 0.25 | 0.15 | 0.15 | 0.10 | Balanced default |
| `CODE` | 0.45 | 0.15 | 0.10 | 0.20 | 0.10 | Wrong code is worse than slow code; reliability weighted up |
| `REASONING` | 0.55 | 0.05 | 0.10 | 0.20 | 0.10 | Quality dominates; users accept latency for analysis |
| `LONG_CONTEXT` | 0.40 | 0.10 | 0.25 | 0.15 | 0.10 | Long inputs are expensive; cost matters more here than anywhere |

Each row sums to 1.00 — asserted by a unit test, so an edit that breaks normalization fails CI.

### 30.4 Worked example

Request: *"Write a debounce function in TypeScript with cancel support."* → `CODE`, ~28 input tokens.

| Model | quality | speed | cost | reliability | availability | score |
|---|---|---|---|---|---|---|
| Claude Sonnet 4.5 | 1.00 | 0.50 | 0.25 | 1.00 | AVAILABLE | `.45(1.00)+.15(.50)+.10(.25)+.20(1.00)+.10(0)` = **0.750** |
| Gemini 2.5 Flash | 0.75 | 1.00 | 1.00 | 0.75 | AVAILABLE | `.45(.75)+.15(1.0)+.10(1.0)+.20(.75)+.10(0)` = **0.738** |
| Mistral Large 2 | 0.75 | 0.50 | 0.50 | 0.75 | UNKNOWN | `(.45(.75)+.15(.5)+.10(.5)+.20(.75))×0.85` = **0.535** |
| Mock | — | — | — | — | — | **excluded by hard filter 1** |

Selected: Claude Sonnet 4.5. Note how close the top two are — that is intentional. The scoring is not
trying to be clever; it is trying to be *defensible and stable*.

### 30.5 Determinism

Given identical inputs, routing always produces an identical result. Guaranteed by:

- No `Math.random()`, no `Date.now()` inside the ranker; time-dependent inputs (availability) are
  passed in as values.
- Tie-break chain: `score` desc → `qualityTier` desc → `rank` asc → `id` lexicographic. `rank` is
  unique, so the chain always terminates at a single winner.
- Floating-point ties are compared with an epsilon of `1e-9` before falling through to tie-breaks,
  so equivalent scores do not order by IEEE noise.

### 30.6 Required routing test cases

| # | Scenario | Expected |
|---|---|---|
| T1 | All providers available, `CODE` | Highest quality×reliability model wins |
| T2 | All providers available, `SHORT_ANSWER` | Fastest tier wins |
| T3 | Only Mock configured, Auto | `NO_MODEL_AVAILABLE`. **Never Mock.** |
| T4 | Mock + one real, Auto | The real model, every time, 1,000 iterations |
| T5 | Top model `TEMPORARILY_UNAVAILABLE` | Second-ranked selected, no error |
| T6 | Input exceeds every context window | `CONTEXT_TOO_LONG`, no attempt made |
| T7 | Two models with identical scores | Same winner across 1,000 runs |
| T8 | All `UNKNOWN` | Highest-scoring still selected, not blocked |
| T9 | User default set | Preference bonus applied; wins only when otherwise close |
| T10 | Weights table | Every row sums to 1.00 |
| T11 | Deprecated model | Never a candidate |
| T12 | `rank` uniqueness | Asserted across the whole catalog |

---

## 31. Manual Model Selection

### 31.1 Manual is authoritative

When `selection.mode === 'manual'`, the orchestrator **skips classification, candidate resolution,
and ranking entirely**. There is one candidate: the requested model. This is not an optimization —
it is the enforcement mechanism for P3. Code that never computes an alternative cannot accidentally
substitute one.

### 31.2 Preflight

| Condition | Response | HTTP |
|---|---|---|
| Model not in registry | `MODEL_NOT_FOUND` | 404 |
| `NOT_CONFIGURED` | `MODEL_NOT_CONFIGURED` — `"GPT-5 is not configured on this server."` | 409 |
| `TEMPORARILY_UNAVAILABLE` / `CONFIGURED_BUT_UNAVAILABLE` | `MODEL_UNAVAILABLE` — `"Claude Sonnet 4.5 is temporarily unavailable."` + `Use Auto instead` | 409 |
| `DEPRECATED` or `DISABLED` | `MODEL_UNAVAILABLE` | 409 |
| `testOnly` and (production **or** `MOCK_PROVIDER_ENABLED` false) | `MODEL_NOT_FOUND` — the mock does not exist as far as production is concerned | 404 |
| Input exceeds this model's context window | `CONTEXT_TOO_LONG` with the model's limit stated | 413 |

Every one of these is a **clear refusal with an offered alternative**, never a silent substitution.

### 31.3 Manual mode and failover

Manual mode does **not** fail over to a different model. Ever. It may retry the *same* model once,
and only for `TIMEOUT` or `NETWORK_ERROR` with zero tokens emitted — a retry of the user's chosen
model is still the user's choice honored; a switch is not.

### 31.4 Explicit Mock selection

Mock is selectable only when `MOCK_PROVIDER_ENABLED=true` **and** `NODE_ENV !== 'production'`. Both
conditions are checked server-side in `GET /api/models` (mock omitted from the payload) and again in
the chat preflight (defense in depth). The frontend additionally gates the `DEVELOPMENT` group on
`import.meta.env.DEV`, but that is cosmetic — the server is the enforcement point.

### 31.5 The three Mock guards, restated

1. `ModelRegistry.listRoutable()` filters `testOnly` with no opt-out parameter.
2. `CandidateResolver` asserts `!descriptor.testOnly` and throws an internal invariant error if one
   appears — a crash is better than a silent mock in production.
3. `GET /api/models` omits `testOnly` models outside development.

Plus a test (T4) that runs Auto 1,000 times with mock + one real model configured and asserts mock
was selected zero times.

---

## 32. Failover

### 32.1 Error classification

| Code | Retryable, 0 tokens | Retryable, >0 tokens | Opens breaker | User-facing |
|---|---|---|---|---|
| `TIMEOUT` | ✓ same, then next | ✗ | ✓ | `The model took too long to respond.` |
| `NETWORK_ERROR` | ✓ same, then next | ✗ | ✓ | `Couldn't reach the model provider.` |
| `PROVIDER_UNAVAILABLE` (502/503) | ✓ next | ✗ | ✓ | `The model provider is unavailable.` |
| `PROVIDER_ERROR` (5xx other) | ✓ next | ✗ | ✓ | `The model provider returned an error.` |
| `RATE_LIMIT` (429) | ✓ next (never same) | ✗ | ✗ (cooldown) | `You've sent too many requests.` |
| `AUTH_ERROR` (401/403) | ✗ | ✗ | ✓ + mark `CONFIGURED_BUT_UNAVAILABLE` | `That model isn't available right now.` |
| `CONTENT_POLICY` | ✗ | ✗ | ✗ | `The model declined to answer this request.` |
| `INVALID_REQUEST` (400) | ✗ | ✗ | ✗ | `Something went wrong while generating the response.` |
| `CONTEXT_TOO_LONG` | ✗ | ✗ | ✗ | `This conversation is too long for the selected model.` |
| `MODEL_NOT_FOUND` | ✗ | ✗ | ✗ | `That model isn't available.` |
| `CANCELLED` | ✗ | ✗ | ✗ | `Stopped.` |
| `UNKNOWN` | ✗ | ✗ | ✗ | `Something went wrong while generating the response.` |

`AUTH_ERROR` never fails over to another model **for the same request** but it does immediately
degrade that provider's availability, so the next request routes around it. Retrying a bad API key
is pointless; leaving it marked healthy is dishonest.

### 32.2 The token boundary — the central rule

> **Once a single token has been emitted to the client, failover is impossible.**

The user is already reading text produced by model A. Silently continuing with model B would splice
two voices into one response, and the attribution line would be a lie either way. So:

| Failure timing | Behavior |
|---|---|
| **Before first token** | Failover permitted (Auto) or same-model retry (Manual), subject to budget |
| **During streaming, after ≥1 token** | **No failover.** Stop. Finalize the partial with `status: 'failed'`. Emit `ERROR` with `partial: true`. UI keeps the text and offers `Regenerate`. |
| **After completion** | Nothing to fail over. Persistence failure is reported separately; the text is already delivered. |
| **After cancellation** | Not a failure. `status: 'cancelled'`, no retry, no failover. |

### 32.3 Attempt budget

```text
maxAttempts:        3          total provider attempts per request
maxFailovers:       2          distinct model switches
maxSameModelRetry:  1          only for TIMEOUT / NETWORK_ERROR, zero tokens
totalBudgetMs:      45_000     wall clock across all attempts; exceeded → stop, no further attempts
backoff:            0ms, 250ms, 750ms   before attempts 1, 2, 3
attemptedModels:    Set — a model is never attempted twice in one request
```

The 45s ceiling is the user-facing latency contract. Three attempts at 20s each would produce a 60s
wait ending in an error, which is worse than failing at 25s.

### 32.4 Failover algorithm

```text
attempted = ∅ ; failovers = 0 ; deadline = now + 45s

loop:
  if now > deadline                        → fail LAST_ERROR
  if attempts ≥ 3                          → fail LAST_ERROR
  model = next candidate ∉ attempted
  if none                                  → fail NO_MODEL_AVAILABLE (or LAST_ERROR if we tried some)
  attempted += model

  result = attempt(model)

  if success                               → stream, record, done
  if tokensEmitted > 0                     → finalize partial as failed, STOP        ← §32.2
  if mode = manual:
      if retryable(TIMEOUT|NETWORK) and sameModelRetries = 0 → retry same model
      else                                 → fail, offer Auto
  if not retryable(error)                  → fail immediately
  if failovers ≥ 2                         → fail LAST_ERROR
  failovers += 1 ; backoff ; continue
```

### 32.5 Disclosure

A failover produces a `METADATA` event carrying the `FailoverRecord`, persisted on the message and
rendered as **one sentence** above the response:

```text
Switched to Mistral Large because Gemini was temporarily unavailable.
```

Rules: shown only when a failover actually occurred; only the final switch is narrated even if two
occurred (`"Switched to X because Y was temporarily unavailable."` names the originally-selected
model as Y); rendered in `--color-text-muted` at `--text-sm`, above the response body; never a
toast, never a banner, never dismissible — it is a permanent part of that message's record.

---

## 33. Streaming

### 33.1 Transport

```text
Browser  fetch(POST /api/chat/stream, { signal })
   │      Accept: text/event-stream
   ▼
Fastify  reply.raw — SSE frames written directly, no serializer
   │      Content-Type: text/event-stream
   │      Cache-Control: no-cache, no-transform
   │      Connection: keep-alive
   │      X-Accel-Buffering: no          ← disables nginx proxy buffering
   ▼
ChatOrchestrator  AsyncIterable<ProviderChunk>
   ▼
ProviderAdapter   undici stream, upstream SSE parsed per provider
   ▼
Provider API
```

`X-Accel-Buffering: no` is not optional. Without it, a reverse proxy buffers the response and the
user sees nothing for the entire generation, then everything at once — the streaming works perfectly
and appears completely broken.

### 33.2 Event protocol

Six event types. The `data` payload of every event is validated against a Zod schema in
`@nexusai/contracts`, on both sides.

```text
event: start
data: {"conversationId":"…","messageId":"…","model":{"modelId":"gemini-2.5-flash",
       "provider":"google","displayName":"Gemini 2.5 Flash"},"mode":"auto"}

event: delta
data: {"text":"A provider abstraction"}

event: metadata
data: {"firstTokenMs":380,"failover":{"from":{…},"to":{…},"reason":"PROVIDER_UNAVAILABLE","attempt":2}}

event: complete
data: {"messageId":"…","latencyMs":2140,"inputTokens":1204,"outputTokens":512,
       "finishReason":"stop"}

event: error
data: {"code":"TIMEOUT","message":"The model took too long to respond.","partial":true,
       "requestId":"…"}

event: cancelled
data: {"messageId":"…","latencyMs":840}
```

Ordering guarantees:

- `start` is always first and always exactly once.
- `metadata` may appear at most twice: once on first token (carrying `firstTokenMs` and any
  failover), once immediately before a terminal event.
- Exactly one terminal event — `complete`, `error`, or `cancelled` — ends every stream.
- `delta` never follows a terminal event.

A client receiving a malformed or out-of-order event discards it, logs it, and continues. The stream
protocol is defensive because a partially-delivered frame at a proxy boundary is a real occurrence.

### 33.3 Heartbeat

Every 15s of silence the server writes an SSE comment line `:keepalive`. This prevents intermediary
proxies and load balancers from closing an idle connection during a slow model's think time. Comment
lines are ignored by the parser by construction and never reach the reducer.

### 33.4 Backpressure

The orchestrator checks `reply.raw.write()`'s return value. On `false` it awaits `'drain'` before
continuing to pull from the provider iterable. Without this, a slow client causes unbounded buffering
in Node's socket write queue and the process grows until it is killed. Provider chunks are pulled
lazily from the `AsyncIterable`, so a paused consumer naturally pauses upstream consumption.

### 33.5 Timeouts

| Timeout | Value | Behavior on expiry |
|---|---|---|
| Connect to provider | 10s | `NETWORK_ERROR`, failover eligible |
| Time to first token | 30s | `TIMEOUT`, failover eligible |
| Inter-token idle | 20s | `TIMEOUT`. If tokens were emitted → finalize partial, no failover |
| Total generation | 180s | `TIMEOUT`, finalize whatever exists |
| Total request incl. failovers | 45s to *start* streaming | No further attempts |

The inter-token idle timeout is the one most implementations omit, and it is the one that matters:
a provider that accepts the connection, emits 40 tokens, and then hangs will otherwise hold the
request open until the total timeout.

### 33.6 Streaming is never faked

No `setInterval` chunking of a complete response. No artificial per-character delay. No simulated
"thinking" pause. If a provider returns a non-streaming response, the adapter emits it as a single
`delta` and the UI renders it instantly — which is honest, and visibly different from a real stream.
A unit test asserts that no timer function appears in the streaming path.

---

## 34. Cancellation

### 34.1 Propagation chain

```text
User clicks Stop / presses Escape
  → AbortController.abort() in use-chat-stream
  → fetch rejects with AbortError; the client stops reading immediately
  → TCP connection closes
  → Fastify 'close' fires on request.raw
  → orchestrator's AbortController.abort()
  → adapter's undici request aborted, socket released
  → provider stops billing/generating
  → finalize: persist partial with status 'cancelled'
```

The chain is one `AbortSignal` threaded from the HTTP layer to the socket. No polling, no flags, no
`isCancelled` booleans checked in loops.

### 34.2 The five cancellation sources

| Source | Detection | Persist | Client sees |
|---|---|---|---|
| **User stop** | Client aborts fetch | `cancelled`, partial retained | `Stopped.` + partial text |
| **Browser disconnect** (tab close, navigation, network drop) | `request.raw.on('close')` before terminal event | `cancelled`, partial retained | Nothing — client is gone. Text is recoverable on reload |
| **Provider cancellation** (upstream closes early) | Iterable ends without a finish chunk | `complete` if a finish reason was seen; otherwise `failed` | Partial + error |
| **Timeout** | Timer fires | `failed`, partial retained | `TIMEOUT` error with `partial: true` |
| **Server shutdown** | `SIGTERM` handler | `cancelled` | `error` with `SERVER_SHUTDOWN` if the frame lands |

### 34.3 Finalization is guaranteed

Every termination path runs through a single `finally` block in the orchestrator's attempt loop. It
is idempotent — guarded by a `finalized` flag — so a race between an abort and a natural completion
cannot double-write or produce two terminal events.

```ts
try {
  for await (const chunk of adapter.stream(req, signal)) { … }
  await finalize('complete');
} catch (err) {
  await finalize(signal.aborted ? 'cancelled' : 'failed', classify(err));
} finally {
  clearTimers();
  if (!finalized) await finalize('failed', INTERNAL);   // belt and braces
}
```

**A message is never left in `streaming` by any code path this process controls.** The only way it
can happen is an uncatchable process death, which is handled by the startup sweep
([§24.3](architecture.md#243-persistence-during-streaming)).

### 34.4 What cancellation must not do

- Must not delete the partial response. The user read it; it is theirs.
- Must not mark the message `complete`. Rule 6 — an interrupted response is not a completed one.
- Must not leave the conversation's `updatedAt` unbumped; a cancelled turn still happened.
- Must not fail the HTTP request. Cancellation is a normal outcome, logged at `info`, not `error`.
