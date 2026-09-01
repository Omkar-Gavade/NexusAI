# 21–24 · Backend Architecture

> **PLANNED — NOT IMPLEMENTED.** No backend exists in this repository. This is
> a design, not a description. It also predates v2.0: it has no per-model
> response, agreement or source persistence. Actual status and the endpoints
> the client expects: [backend/README.md](../../backend/README.md).


## 21. Backend Architecture

### 21.1 Shape: modular monolith

One deployable Node process. Internal boundaries are enforced by directory structure and lint rules
rather than by network hops. No microservices, no message bus, no service mesh, no Kubernetes.

The extraction seam that actually matters — if it ever matters — is the **provider platform**
(registry + adapters + health), because it is the only part with a plausible independent scaling
profile. It is therefore isolated behind a narrow interface (`ProviderRegistry`, `ProviderAdapter`)
with no inbound dependency from HTTP handlers. Extracting it later means replacing an in-process
call with an RPC call at one seam. Nothing else is pre-extracted, because nothing else has a reason.

### 21.2 Dependency ledger

| Package | Why | Rejected alternative |
|---|---|---|
| `fastify` v5 | Fastest mainstream Node HTTP server; first-class schema validation and lifecycle hooks; encapsulated plugin system that gives us real module boundaries; `reply.raw` access for streaming | Express — no schema layer, slower, plugin ecosystem is middleware soup |
| `mongodb` (official driver) | Direct, explicit queries. **Mongoose is rejected**: it duplicates the schema we already own in Zod, hides queries behind magic, adds middleware surprises, and its typing is weaker than the driver's own | Mongoose |
| `ioredis` | Mature client with cluster support and a sane API | `node-redis` |
| `zod` | Shared with the frontend through `@nexusai/contracts` — one schema, two runtimes | `typebox`/`ajv`: faster, but not shareable as ergonomically |
| `pino` | Structured JSON logs, negligible overhead, Fastify-native, first-class redaction | `winston` — slower, no built-in redaction |
| `@node-rs/argon2` | Argon2id password hashing, native binding | `bcrypt` — weaker against GPU attack |
| `jose` | EdDSA JWT sign/verify with a maintained, spec-correct implementation | `jsonwebtoken` — weaker defaults, algorithm-confusion history |
| `@fastify/cookie`, `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` | Cookie parsing, security headers, CORS, rate limiting | Hand-rolled |
| `undici` | Native-adjacent HTTP client with proper streaming, timeouts, and connection pooling for provider calls | Provider SDKs — see §25 |
| `vitest` | Same runner as the frontend | Jest |

**Rejected:** provider vendor SDKs (`@google/generative-ai`, `openai`, `@anthropic-ai/sdk`, …) as a
default. Rationale in [Provider Architecture](ai-platform.md#251-why-http-not-vendor-sdks).

### 21.3 Layering and dependency direction

```text
        HTTP (routes, schemas)          Fastify types live only here
                  ↓
        Application (services)          orchestration, transactions, authorization
                  ↓
        Domain (entities, policy)       pure TypeScript — zero I/O imports
                  ↑
        Infrastructure (repos, providers, cache, clock)
```

Domain is at the bottom of the arrow *and* implemented by infrastructure: the domain declares
interfaces (`ConversationRepository`, `ProviderAdapter`, `Clock`), infrastructure implements them,
and the application layer receives implementations by constructor injection.

**Hard rules, lint-enforced:**

- `domain/` may not import `mongodb`, `ioredis`, `fastify`, `undici`, `pino`, or any provider SDK.
  It may import `zod` and `@nexusai/contracts` only.
- `modules/*/routes.ts` may not import `infrastructure/` directly. It calls a service.
- `infrastructure/` may not import from `modules/`.
- No module imports another module's internals. Cross-module use goes through the target module's
  exported service interface, resolved from the composition root.

### 21.4 Composition root

There is no DI container. Dependencies are constructed once, explicitly, in `app/container.ts` —
about 60 lines of plain `new` calls, readable top to bottom. A container library would obscure the
one file where the entire object graph is visible.

```ts
export function buildContainer(config: Config, deps: Runtime): Container {
  const users         = new MongoUserRepository(deps.mongo);
  const conversations = new MongoConversationRepository(deps.mongo);
  const messages      = new MongoMessageRepository(deps.mongo);

  const registry      = new ModelRegistry(MODEL_CATALOG, config.providers);
  const adapters      = buildAdapters(config.providers, deps.http);       // only configured ones
  const health        = new ProviderHealthService(adapters, deps.redis, deps.clock);
  const availability  = new AvailabilityResolver(registry, health, config);

  const orchestrator  = new ChatOrchestrator({
    registry, availability, adapters, messages, conversations,
    classifier: new TaskClassifier(),
    ranker:     new ModelRanker(RANKING_WEIGHTS),
    failover:   new FailoverManager(FAILOVER_POLICY),
    recorder:   new RoutingRecorder(deps.logger),
    clock:      deps.clock,
  });

  return { users, conversations, messages, registry, availability, health, orchestrator };
}
```

Tests build the same container with in-memory or fake implementations. There is no test-only wiring
path that differs structurally from production.

### 21.5 Fastify plugin structure

Each module is a Fastify plugin registered under a prefix, giving genuine encapsulation of hooks and
decorators:

```ts
await app.register(authModule,          { prefix: '/api/auth' });
await app.register(conversationsModule, { prefix: '/api/conversations' });
await app.register(modelsModule,        { prefix: '/api/models' });
await app.register(chatModule,          { prefix: '/api/chat' });
await app.register(healthModule,        { prefix: '/health' });
```

Global plugins registered before modules, in order: `helmet` → `cors` → `cookie` → `rateLimit` →
request-id → auth decorator → error handler.

### 21.6 Request lifecycle

```text
  request
    → requestId assigned (X-Request-Id honored if well-formed, else generated)
    → helmet security headers
    → CORS (strict allowlist)
    → rate limit (per route class)
    → body parse, 256KB limit
    → Zod validation against the contracts schema  → 400 on failure
    → authenticate: verify access cookie           → 401 on failure
    → authorize: resource ownership check          → 404 on failure (never 403 — see §38)
    → service call
    → serialize response
    → access log with duration, status, userId, requestId
```

### 21.7 Graceful shutdown

On `SIGTERM`: stop accepting connections; allow in-flight non-streaming requests 10s to drain;
**for active streams, send a terminal `ERROR` event with `code: SERVER_SHUTDOWN` and finalize each
assistant message as `cancelled` before closing** — a stream that dies without finalization leaves a
message permanently in `streaming` state, which is a correctness bug, not a cosmetic one. Then close
Mongo and Redis. Hard exit at 20s.

---

## 22. Backend Repository Structure

```text
apps/api/
├── src/
│   ├── server.ts                     process entry: config → runtime → app → listen → signals
│   │
│   ├── app/
│   │   ├── build-app.ts              Fastify instance, plugin registration order
│   │   ├── container.ts              composition root
│   │   ├── error-handler.ts          AppError → HTTP mapping, the ONLY place that maps
│   │   └── request-context.ts        requestId, userId, logger child per request
│   │
│   ├── config/
│   │   ├── env.ts                    Zod-validated environment, fails fast at boot
│   │   └── providers.ts              which providers are configured, from env
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── routes.ts             register, login, logout, refresh, me
│   │   │   ├── auth-service.ts       registration, credential verification, session issue/rotate
│   │   │   ├── token-service.ts      sign/verify access + refresh, rotation, reuse detection
│   │   │   └── password.ts           argon2id hash/verify, tuned parameters
│   │   ├── conversations/
│   │   │   ├── routes.ts
│   │   │   └── conversation-service.ts
│   │   ├── messages/
│   │   │   ├── routes.ts             history under /api/conversations/:id/messages
│   │   │   └── message-service.ts
│   │   ├── models/
│   │   │   ├── routes.ts             GET /api/models
│   │   │   └── catalog-service.ts    registry + availability → wire DTO
│   │   ├── chat/
│   │   │   ├── routes.ts             POST /api/chat/stream — SSE transport only
│   │   │   └── sse-writer.ts         event framing, heartbeat, backpressure
│   │   └── health/
│   │       └── routes.ts             /health/live, /health/ready
│   │
│   ├── domain/                       PURE — no I/O imports, ever
│   │   ├── user.ts
│   │   ├── conversation.ts
│   │   ├── message.ts
│   │   ├── model-descriptor.ts
│   │   ├── availability.ts           the state enum + resolution rules
│   │   ├── errors.ts                 AppError hierarchy, error codes, retryability
│   │   ├── ports.ts                  repository + adapter + clock interfaces
│   │   └── chat/
│   │       ├── orchestrator.ts       ChatOrchestrator — coordination only
│   │       ├── task-classifier.ts
│   │       ├── capability-resolver.ts
│   │       ├── candidate-resolver.ts
│   │       ├── model-ranker.ts       deterministic scoring
│   │       ├── failover-manager.ts   attempt policy
│   │       └── routing-decision.ts   the recorded decision value object
│   │
│   ├── infrastructure/
│   │   ├── mongodb/
│   │   │   ├── client.ts             connection, pool config
│   │   │   ├── indexes.ts            declarative index definitions, applied at boot
│   │   │   ├── user-repository.ts
│   │   │   ├── conversation-repository.ts
│   │   │   └── message-repository.ts
│   │   ├── redis/
│   │   │   ├── client.ts
│   │   │   ├── session-store.ts      refresh token families, reuse detection
│   │   │   ├── rate-limiter.ts       sliding window
│   │   │   └── health-store.ts       provider health snapshots
│   │   ├── providers/
│   │   │   ├── registry.ts           ModelRegistry — catalog + lookup
│   │   │   ├── catalog.ts            THE model catalog data (see §27)
│   │   │   ├── health-service.ts     background prober, circuit breaker
│   │   │   ├── http-client.ts        undici pool, timeouts, abort propagation
│   │   │   ├── sse-parse.ts          shared upstream SSE parsing
│   │   │   ├── errors.ts             upstream status/shape → AppError classification
│   │   │   └── adapters/
│   │   │       ├── gemini.ts
│   │   │       ├── openai.ts
│   │   │       ├── anthropic.ts
│   │   │       ├── mistral.ts
│   │   │       ├── deepseek.ts
│   │   │       ├── groq.ts
│   │   │       ├── openrouter.ts
│   │   │       ├── nvidia.ts
│   │   │       └── mock.ts           testOnly: true
│   │   └── observability/
│   │       ├── logger.ts             pino instance, redaction paths
│   │       └── metrics.ts            counters/histograms, /metrics endpoint
│   │
│   └── types/fastify.d.ts            request decorator typing (user, requestId, container)
│
├── tests/
│   ├── unit/                         mirrors src/domain and src/infrastructure
│   ├── integration/                  real Mongo + Redis via testcontainers
│   └── fixtures/
├── Dockerfile
└── package.json
```

### 22.1 What each critical file must not contain

| File | Must NOT contain |
|---|---|
| `modules/chat/routes.ts` | Provider logic, ranking, model selection, retry policy. It is transport: validate → call orchestrator → write SSE frames. Target under 120 lines. |
| `domain/chat/orchestrator.ts` | HTTP types, Mongo types, provider HTTP calls, SSE framing, `if (provider === ...)`. It coordinates named collaborators. Target under 200 lines. |
| `domain/chat/model-ranker.ts` | I/O of any kind, `Date.now()`, `Math.random()`. It is a pure function of (candidates, context, weights). |
| `infrastructure/providers/adapters/*.ts` | Ranking, availability policy, persistence, business rules. Each adapter translates one provider's wire format and nothing else. |
| `app/error-handler.ts` | Business logic. It maps `AppError` → status + body. It is the only file that constructs an HTTP error response. |
| `domain/**` | Any import from `mongodb`, `ioredis`, `fastify`, `undici`, `pino`. |
| Anywhere | A file named `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`, or a `services/` directory of unrelated functions. |

---

## 23. Domain Model

### 23.1 Entities

```ts
// domain/user.ts
type User = {
  id: UserId;
  email: Email;                    // normalized: trimmed, lowercased
  passwordHash: string;            // argon2id — never leaves the repository layer
  displayName: string;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
};

type UserPreferences = {
  theme: 'dark' | 'light' | 'system';
  defaultModel: ModelSelection;    // { mode: 'auto' } | { mode: 'manual', modelId: string }
};

// domain/conversation.ts
type Conversation = {
  id: ConversationId;
  userId: UserId;                  // ownership — the authorization anchor
  title: string;                   // ≤120 chars
  createdAt: Date;
  updatedAt: Date;                 // bumped on every message; drives sidebar ordering
  messageCount: number;            // denormalized, see §24.4
  lastModel: ModelRef | null;      // shown as the selector's default on reopen
};

// domain/message.ts
type Message = {
  id: MessageId;
  conversationId: ConversationId;
  userId: UserId;                  // denormalized for single-query authorization
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;
  model: ModelRef | null;          // null for user messages
  metadata: MessageMetadata | null;
  createdAt: Date;
};

type MessageStatus =
  | 'complete'      // finished normally
  | 'streaming'     // in flight — never returned as final to a client
  | 'cancelled'     // user stopped; content is a real partial
  | 'failed';       // generation errored; content may be partial or empty

type ModelRef = { modelId: string; provider: string; displayName: string };

type MessageMetadata = {
  latencyMs: number;               // request start → last token
  firstTokenMs: number | null;     // request start → first token
  inputTokens: number | null;      // null when the provider does not report them
  outputTokens: number | null;
  finishReason: 'stop' | 'length' | 'content_filter' | 'cancelled' | 'error' | null;
  routing: RoutingSummary;
  failover: FailoverRecord | null;
};

type RoutingSummary = {
  mode: 'auto' | 'manual';
  taskClass: TaskClass;
  candidateCount: number;
  selectedScore: number | null;    // null in manual mode
};

type FailoverRecord = {
  from: ModelRef;
  to: ModelRef;
  reason: ErrorCode;
  attempt: number;
};
```

**`inputTokens` and `outputTokens` are nullable and stay null when the provider does not report
them.** Estimating tokens locally and presenting the estimate as a measurement would violate Rule 6.
The UI omits the count entirely rather than showing an approximation.

### 23.2 Identifiers

Branded types prevent the single most common ID bug:

```ts
type UserId         = string & { readonly __brand: 'UserId' };
type ConversationId = string & { readonly __brand: 'ConversationId' };
type MessageId      = string & { readonly __brand: 'MessageId' };
```

Passing a `ConversationId` where a `UserId` is expected is a compile error. IDs are MongoDB
`ObjectId` hex strings at rest, converted at the repository boundary; `ObjectId` never appears
above `infrastructure/`.

### 23.3 Invariants

Enforced in the domain, tested directly, and independent of any storage engine:

1. A `Message` always belongs to a `Conversation` owned by the same `userId`.
2. Every assistant `Message` has a non-null `model`; every user `Message` has `model === null`.
3. A message with `status: 'complete'` has non-empty `content` and non-null `metadata`.
4. `status: 'streaming'` is never serialized to a client as a final message.
5. `Conversation.updatedAt >= createdAt`, and is bumped on every message write.
6. A conversation's messages, ordered by `createdAt`, alternate starting with `user`; consecutive
   assistant messages occur only via regeneration, which supersedes rather than appends.
7. A model with `testOnly: true` never appears in an automatic routing decision.

### 23.4 Domain policies (pure, unit-tested, zero I/O)

| Policy | Signature |
|---|---|
| Title derivation | `deriveTitle(firstUserMessage: string): string` — 60 chars, word boundary, ellipsis |
| Ownership | `assertOwnership(resource: { userId }, actor: UserId): void` |
| Context fit | `fitsContext(messages, model): boolean` |
| History window | `selectHistory(messages, model): Message[]` — newest-first until the budget is hit |
| Availability | `resolveAvailability(descriptor, health, config): Availability` |
| Retryability | `isRetryable(error: AppError, tokensEmitted: number): boolean` |
| Ranking | `rank(candidates, context, weights): RankedModel[]` |

---

## 24. MongoDB Schema

### 24.1 Collections

Exactly three. `sessions` is deliberately **not** a collection — refresh-token families live in
Redis with a native TTL, which is what Redis is for. Adding a fourth collection to store data that
expires would mean writing our own expiry sweep.

#### `users`

```js
{
  _id:          ObjectId,
  email:        "omkar@example.com",     // normalized lowercase
  passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$...",
  displayName:  "Omkar",
  preferences:  { theme: "system", defaultModel: { mode: "auto" } },
  createdAt:    ISODate,
  updatedAt:    ISODate
}
```

| Index | Definition | Purpose |
|---|---|---|
| `email_unique` | `{ email: 1 }`, unique, `collation: { locale: 'en', strength: 2 }` | Login lookup + duplicate prevention, case-insensitive at the index level rather than by hoping every call site lowercases |

#### `conversations`

```js
{
  _id:          ObjectId,
  userId:       ObjectId,
  title:        "Provider abstraction design",
  createdAt:    ISODate,
  updatedAt:    ISODate,
  messageCount: 14,
  lastModel:    { modelId: "gemini-2.5-flash", provider: "google", displayName: "Gemini 2.5 Flash" }
}
```

| Index | Definition | Purpose |
|---|---|---|
| `user_recent` | `{ userId: 1, updatedAt: -1 }` | The sidebar query. Covers filter + sort in one index scan |
| `user_created` | `{ userId: 1, createdAt: -1 }` | Stable cursor pagination when many conversations share an `updatedAt` |

#### `messages`

```js
{
  _id:            ObjectId,
  conversationId: ObjectId,
  userId:         ObjectId,          // denormalized
  role:           "assistant",
  content:        "A provider abstraction should…",
  status:         "complete",
  model:          { modelId: "gemini-2.5-flash", provider: "google", displayName: "Gemini 2.5 Flash" },
  metadata: {
    latencyMs: 2140, firstTokenMs: 380,
    inputTokens: 1204, outputTokens: 512,
    finishReason: "stop",
    routing:  { mode: "auto", taskClass: "CODE", candidateCount: 4, selectedScore: 0.812 },
    failover: null
  },
  createdAt:      ISODate
}
```

| Index | Definition | Purpose |
|---|---|---|
| `conversation_time` | `{ conversationId: 1, createdAt: 1 }` | History fetch and pagination |
| `user_conversation` | `{ userId: 1, conversationId: 1 }` | Authorization check without a join |

**Why `userId` is denormalized onto messages.** Without it, authorizing a message read requires
loading the conversation first — two round trips on the hot path, and a second place where the check
can be forgotten. With it, every message query carries `userId` in the filter, so an
authorization failure degrades to an empty result rather than to a data leak. The cost is that
ownership can never change; conversations are not transferable, and that is an accepted constraint.

### 24.2 Query patterns

| # | Operation | Query | Index |
|---|---|---|---|
| Q1 | Sidebar list | `find({ userId }).sort({ updatedAt: -1 }).limit(50)` | `user_recent` |
| Q2 | Open conversation | `findOne({ _id, userId })` | `_id` + filter |
| Q3 | Message history | `find({ conversationId, userId }).sort({ createdAt: 1 }).limit(50)` | `conversation_time` |
| Q4 | Older messages | `find({ conversationId, userId, createdAt: { $lt: cursor } }).sort({ createdAt: -1 }).limit(50)` | `conversation_time` |
| Q5 | Context assembly | `find({ conversationId, userId, status: { $in: ['complete','cancelled'] } }).sort({ createdAt: -1 }).limit(80)` | `conversation_time` |
| Q6 | Rename | `updateOne({ _id, userId }, { $set: { title, updatedAt } })` | `_id` |
| Q7 | Delete | `deleteMany({ conversationId, userId })` then `deleteOne({ _id, userId })` | both |
| Q8 | Login | `findOne({ email })` with collation | `email_unique` |

**Every query filters by `userId`.** There is no query in the codebase that reads a conversation or
message without it — asserted by a test that greps the repository layer for `find`/`update`/`delete`
calls lacking a `userId` term.

### 24.3 Persistence during streaming

```text
t0   validate request, authorize conversation
t1   insert user message                       status: complete
t2   insert assistant message                  status: streaming, content: ""
     ── emit START { conversationId, messageId, model } ──
t3   provider deltas accumulate in memory (no DB write per token)
     ── emit DELTA × N ──
t4   terminal:
     COMPLETE  → updateOne { content, status: 'complete',  metadata }
     CANCEL    → updateOne { content, status: 'cancelled', metadata }
     ERROR     → updateOne { content, status: 'failed',    metadata }
t5   updateOne conversation { updatedAt, $inc messageCount: 2, lastModel }
```

**One write per message, not one per token.** Writing every delta would produce thousands of writes
per response for no user benefit. The accepted cost: a hard process crash mid-stream leaves a
message in `streaming`. This is mitigated, not ignored:

- Graceful shutdown finalizes active streams (§21.7).
- A startup sweep marks any `streaming` message older than 10 minutes as `failed`.
- The read path never returns `streaming` as a final message; the API maps it to `failed` with a
  note.

Cross-process stream resume is **not** implemented in MVP. It requires either per-delta persistence
or a Redis mirror plus a reaper, and the user-visible benefit — surviving a server restart mid-response
— does not justify that machinery yet. This is recorded as an accepted risk (R4).

### 24.4 Denormalization and consistency

`messageCount` and `lastModel` are denormalized onto the conversation to keep the sidebar query
index-covered. They are updated in the same operation that bumps `updatedAt`. If that write fails
after messages are written, the count drifts — a cosmetic inconsistency that is corrected on the
next successful message. A transaction is **not** used: MongoDB multi-document transactions require
a replica set even in development, and the correctness value here is near zero.

`messageCount` is never used for pagination or for authorization. Only for display.

### 24.5 Retention

MVP retains everything until the user deletes it. Deleting a conversation hard-deletes its messages
in the same request (`deleteMany` by `conversationId` + `userId`, then the conversation). No soft
delete, no tombstones, no trash — a trash feature nobody asked for is speculative scope, and soft
deletes create an ongoing obligation to filter `deletedAt` in every query, which is exactly the kind
of subtle authorization footgun this schema is designed to avoid.

Account deletion is out of MVP scope but the data model supports it trivially: three deletes keyed
by `userId`.

### 24.6 Connection and driver configuration

```ts
{
  maxPoolSize: 20,              // ~4 concurrent Mongo ops per streaming request, 5 concurrent streams/instance
  minPoolSize: 2,
  maxIdleTimeMS: 30_000,
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 5_000,
  socketTimeoutMS: 20_000,
  retryWrites: true,
  retryReads: true,
  writeConcern: { w: 'majority' },
  readPreference: 'primaryPreferred',
}
```

Indexes are declared in `infrastructure/mongodb/indexes.ts` and applied with `createIndexes` at
boot. Boot fails if an index cannot be created. There is no migration framework — three collections
with additive-only schema changes do not need one, and adding one now would be premature.
