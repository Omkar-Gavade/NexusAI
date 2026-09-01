# 35–36 · Contracts

> **LEGACY — superseded by `packages/contracts`.** This describes the v1.0 HTTP
> surface, whose `ChatEvent` union has no per-model or synthesis events. The
> typed schemas in `packages/contracts/src` are authoritative. **A defined
> contract is not an implemented endpoint** — see
> [capability-matrix.md](../product/capability-matrix.md) for which each is.


## 35. API Contract

### 35.1 Conventions

| Aspect | Decision |
|---|---|
| Base path | `/api` |
| Content type | `application/json` except `POST /api/chat/stream` → `text/event-stream` |
| Auth | httpOnly cookies (`nx_at`, `nx_rt`). No `Authorization` header, no token in JS |
| CSRF | Required header `X-Nexus-Client: web` on every mutating request + `Origin` allowlist check |
| Timestamps | ISO 8601 UTC with milliseconds — `2026-08-18T14:03:22.481Z` |
| IDs | 24-char lowercase hex (Mongo ObjectId) |
| Pagination | Cursor-based. `?cursor=<id>&limit=<n>`; response carries `nextCursor: string \| null` |
| Errors | One envelope, always (§35.9) |
| Versioning | None in MVP. The client and API deploy together. When an external consumer exists, `/api/v2` is added alongside — never a header-negotiated version |

### 35.2 Authentication

#### `POST /api/auth/register`

```jsonc
// request
{ "email": "omkar@example.com", "password": "correct-horse-battery", "displayName": "Omkar" }

// 201
{
  "user": { "id": "6650…", "email": "omkar@example.com", "displayName": "Omkar",
            "preferences": { "theme": "system", "defaultModel": { "mode": "auto" } },
            "createdAt": "2026-08-18T14:03:22.481Z" }
}
// Set-Cookie: nx_at=…; HttpOnly; Secure; SameSite=Lax;    Path=/;           Max-Age=900
// Set-Cookie: nx_rt=…; HttpOnly; Secure; SameSite=Strict; Path=/api/auth;   Max-Age=2592000
```

Validation: email RFC-5322-shaped and ≤254 chars; password 12–128 chars; displayName 1–60 chars
after trim.
Errors: `409 EMAIL_TAKEN`, `400 VALIDATION_ERROR`, `429 RATE_LIMITED`.

#### `POST /api/auth/login`

`{ email, password }` → `200 { user }` + both cookies.
`401 INVALID_CREDENTIALS` for both unknown email and wrong password — identical message and
identical timing (§39.3), so the endpoint cannot be used to enumerate accounts.

#### `POST /api/auth/refresh`

No body. Reads `nx_rt`. Returns `204` with rotated cookies.
`401 SESSION_EXPIRED` when absent, expired, or revoked.
`401 SESSION_REVOKED` when reuse is detected — **the entire token family is destroyed**, logging out
every device, because reuse means the token leaked.

#### `POST /api/auth/logout`

Revokes the current refresh family and clears both cookies. Returns `204`. Idempotent: calling it
without a session also returns `204`, because "make me logged out" has succeeded either way.

#### `GET /api/auth/me`

`200 { user }` or `401`. Used once on boot to hydrate session state.

#### `PATCH /api/auth/me`

`{ displayName?, preferences? }` → `200 { user }`. The only mutable profile surface in MVP. Email
and password changes are out of scope and their absence is deliberate, not an oversight.

### 35.3 Models

#### `GET /api/models`

```jsonc
// 200
{
  "models": [
    {
      "id": "gemini-2.5-flash",
      "provider": { "id": "google", "displayName": "Google" },
      "displayName": "Gemini 2.5 Flash",
      "description": "Fast responses for everyday questions and code.",
      "contextWindow": 1048576,
      "maxOutputTokens": 8192,
      "capabilities": { "reasoning": false, "vision": true, "audio": false,
                        "video": false, "documents": true, "toolCalling": true },
      "availability": "AVAILABLE",
      "availabilityReason": null,
      "deprecated": false
    },
    {
      "id": "gpt-5",
      "provider": { "id": "openai", "displayName": "OpenAI" },
      "displayName": "GPT-5",
      "description": "Strong general reasoning.",
      "contextWindow": 400000,
      "maxOutputTokens": 16384,
      "capabilities": { … },
      "availability": "NOT_CONFIGURED",
      "availabilityReason": "No API key configured on this server.",
      "deprecated": false
    }
  ],
  "auto": { "available": true },
  "checkedAt": "2026-08-18T14:03:20.000Z"
}
```

**Not exposed:** `speedTier`, `qualityTier`, `costTier`, `reliabilityTier`, `rank`,
`providerModelId`. These are routing internals. Publishing them invites users to reverse-engineer
the router and turns a calm product into a configuration surface. `capabilities` **is** exposed
because it explains why a model is or is not offered for a given task.

`testOnly` models are omitted from this payload unless `MOCK_PROVIDER_ENABLED=true` **and**
`NODE_ENV !== 'production'`.

`auto.available` is `false` when no routable model exists — this is what the client uses to disable
the composer and show `No real models are currently available.`

Cache: `Cache-Control: private, max-age=30`.

### 35.4 Conversations

| Method | Path | Body | Success |
|---|---|---|---|
| `GET` | `/api/conversations?cursor=&limit=50` | — | `200 { conversations: Conversation[], nextCursor }` |
| `GET` | `/api/conversations/:id` | — | `200 { conversation }` |
| `PATCH` | `/api/conversations/:id` | `{ title }` (1–120 chars) | `200 { conversation }` |
| `DELETE` | `/api/conversations/:id` | — | `204` |

```jsonc
// Conversation
{ "id": "6650…", "title": "Provider abstraction design",
  "createdAt": "…", "updatedAt": "…", "messageCount": 14,
  "lastModel": { "modelId": "gemini-2.5-flash", "provider": "google",
                 "displayName": "Gemini 2.5 Flash" } }
```

**There is no `POST /api/conversations`.** Conversations are created as a side effect of the first
message, inside `POST /api/chat/stream`. A separate create endpoint would allow empty conversations
to exist, would require the client to sequence two calls before the first token, and would introduce
an orphan-cleanup problem. This is a deliberate deviation from the endpoint list in the brief; the
brief invites it (`You may modify naming if your architecture has a strong reason`).

`DELETE` returns `204` whether or not the conversation existed **for this user** — see §38.2.

### 35.5 Messages

#### `GET /api/conversations/:id/messages?cursor=&limit=50`

```jsonc
{
  "messages": [
    { "id": "6651…", "role": "user", "content": "How should I structure…",
      "status": "complete", "model": null, "metadata": null, "createdAt": "…" },
    { "id": "6652…", "role": "assistant", "content": "A provider abstraction should…",
      "status": "complete",
      "model": { "modelId": "gemini-2.5-flash", "provider": "google",
                 "displayName": "Gemini 2.5 Flash" },
      "metadata": { "latencyMs": 2140, "firstTokenMs": 380,
                    "inputTokens": 1204, "outputTokens": 512,
                    "finishReason": "stop",
                    "failover": null },
      "createdAt": "…" }
  ],
  "nextCursor": "6640…"
}
```

Returned newest-page-first for cursoring, but each page is ordered oldest→newest within itself so
the client can prepend a page without re-sorting.

`routing` is stripped from the wire representation of `metadata` — internal scores are not user
data. `failover` **is** included, because it is the evidence behind a user-visible claim.

A message stored as `streaming` (only possible after an uncontrolled crash) is returned as
`status: "failed"`. The client never sees `streaming` in a history response.

### 35.6 Chat

#### `POST /api/chat/stream`

```jsonc
// request
{
  "conversationId": "6650…" | null,          // null → create a new conversation
  "message": "Write a debounce function in TypeScript.",
  "selection": { "mode": "auto" } | { "mode": "manual", "modelId": "claude-sonnet-4-5" },
  "clientMessageId": "01J8…"                 // ULID, for optimistic reconciliation + idempotency
}
```

Response: `200 text/event-stream`, frames as specified in
[§33.2](../backend/ai-platform.md#332-event-protocol).

Preflight errors are returned as **normal JSON with a 4xx status before the stream opens** — a
`400` is easier for a client to handle than a `200` containing an error event. Once the stream has
opened (i.e. after `start`), all failures are `error` events inside a `200` response, because the
status line is already committed.

| Preflight failure | Status | Code |
|---|---|---|
| Body invalid | 400 | `VALIDATION_ERROR` |
| Not authenticated | 401 | `UNAUTHENTICATED` |
| Conversation not owned / missing | 404 | `NOT_FOUND` |
| Manual model unknown | 404 | `MODEL_NOT_FOUND` |
| Manual model unavailable | 409 | `MODEL_UNAVAILABLE` |
| No routable model (Auto) | 503 | `NO_MODEL_AVAILABLE` |
| Message exceeds every context window | 413 | `CONTEXT_TOO_LONG` |
| Rate limited | 429 | `RATE_LIMITED` |
| Message empty after trim, or > 32,000 chars | 400 | `VALIDATION_ERROR` |

**Idempotency.** `clientMessageId` is a ULID. If the same value arrives twice within 60s for the
same user (tracked in Redis), the second request is rejected with `409 DUPLICATE_REQUEST` rather
than generating twice. This protects against a double-submit and against a retry after a flaky
network — both of which would otherwise cost money and produce two divergent responses.

#### `POST /api/chat/regenerate`

```jsonc
{ "conversationId": "6650…", "messageId": "6652…",
  "selection": { "mode": "auto" }, "clientMessageId": "01J9…" }
```

Regenerates the assistant response to the user message preceding `messageId`. The superseded
assistant message is **deleted**, not versioned — response history is not a feature anyone asked
for, and keeping it would require a UI to browse it. Streams identically to `/chat/stream`.

### 35.7 Health

| Path | Auth | Returns |
|---|---|---|
| `GET /health/live` | none | `200 { status: "ok" }` — process is running. Never touches Mongo or Redis; a liveness probe that fails on a DB blip causes a restart loop |
| `GET /health/ready` | none | `200 { status, mongo, redis }` or `503`. Dependency reachability only — **no provider names, no availability, no counts.** An unauthenticated endpoint that enumerates configured providers is an information leak |

### 35.8 Rate limits

| Class | Endpoints | Limit | Key |
|---|---|---|---|
| Auth write | register, login | 5 / 15 min | IP + email hash |
| Refresh | refresh | 30 / 15 min | IP |
| Chat | chat/stream, chat/regenerate | 20 / min, 300 / hour | userId |
| Read | everything else | 120 / min | userId, else IP |

Responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` on
429.

### 35.9 Error envelope

Every non-2xx JSON response, without exception:

```jsonc
{
  "error": {
    "code": "MODEL_UNAVAILABLE",
    "message": "Claude Sonnet 4.5 is temporarily unavailable.",
    "requestId": "01J8XQ7K3M2N4P5Q6R7S8T9V0W",
    "details": [ { "path": "message", "message": "String must contain at least 1 character" } ]
  }
}
```

- `message` is **always user-presentable**. It is written for a person, contains no stack trace, no
  provider name unless the provider is already visible to this user, no internal identifiers.
- `details` appears only for `VALIDATION_ERROR`, and only with field paths from our own schema.
- `requestId` is echoed so a user-reported problem maps to a log line.

---

## 36. Shared Contracts

### 36.1 The package

```text
packages/contracts/
├── src/
│   ├── auth.ts        RegisterRequest, LoginRequest, UserDto, SessionResponse
│   ├── models.ts      ModelDto, ProviderDto, Availability, ModelsResponse
│   ├── conversation.ts ConversationDto, ListConversationsResponse, RenameRequest
│   ├── message.ts     MessageDto, MessageMetadataDto, MessageStatus, ModelRef
│   ├── chat.ts        ChatRequest, ChatEvent (discriminated union), RegenerateRequest
│   ├── error.ts       ErrorCode enum, ErrorResponse
│   └── index.ts       explicit named re-exports (the one permitted barrel)
├── package.json       "@nexusai/contracts"
└── tsconfig.json
```

### 36.2 Zod first, types derived

Schemas are the source of truth; TypeScript types are inferred from them. The reverse — types with
hand-written validators — guarantees they drift.

```ts
export const ChatRequest = z.object({
  conversationId: z.string().regex(/^[a-f\d]{24}$/).nullable(),
  message: z.string().trim().min(1).max(32_000),
  selection: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('auto') }),
    z.object({ mode: z.literal('manual'), modelId: z.string().min(1).max(80) }),
  ]),
  clientMessageId: z.string().length(26),
});
export type ChatRequest = z.infer<typeof ChatRequest>;
```

### 36.3 Where validation runs

| Boundary | Validates | Rationale |
|---|---|---|
| API request handler | Request body, params, query | Untrusted input |
| API response serializer | **Dev and test only** | Catches contract violations during development at zero production cost |
| Client SSE parser | Every `ChatEvent` | Streams cross proxies; a truncated frame must be detected, not rendered |
| Client HTTP responses | **Dev only** | Same reasoning; production trusts our own API and saves the parse |

Validating every production response on both ends is symmetrical and satisfying and wastes CPU on
data we just produced. Dev-and-test-only validation catches the same drift before it ships.

### 36.4 The `ChatEvent` union

```ts
export const ChatEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), conversationId: z.string(), messageId: z.string(),
             model: ModelRef, mode: z.enum(['auto', 'manual']) }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('metadata'), firstTokenMs: z.number().nullable(),
             failover: FailoverRecord.nullable() }),
  z.object({ type: z.literal('complete'), messageId: z.string(), latencyMs: z.number(),
             inputTokens: z.number().nullable(), outputTokens: z.number().nullable(),
             finishReason: FinishReason }),
  z.object({ type: z.literal('error'), code: ErrorCode, message: z.string(),
             partial: z.boolean(), requestId: z.string() }),
  z.object({ type: z.literal('cancelled'), messageId: z.string(), latencyMs: z.number() }),
]);
```

A discriminated union means the client's stream reducer gets exhaustiveness checking from the
compiler: adding a seventh event type produces a type error at every `switch` that fails to handle
it. This is the mechanism that prevents an unhandled event silently doing nothing.

### 36.5 Preventing drift

- Both apps depend on `@nexusai/contracts` as a workspace package. There is no copied type anywhere.
- The API's Fastify route schemas are generated from the same Zod objects, so the OpenAPI-style
  documentation and the runtime validation cannot disagree.
- A contract change that breaks either app breaks `tsc` in CI for both. There is no runtime-only
  contract.
- A test enumerates every `ErrorCode` and asserts each has a user-facing message mapping — so a new
  error code cannot ship without human-readable copy.
- The package emits types **and** runtime code; it is not `declare`-only, because the Zod schemas
  are needed at runtime on both sides.
