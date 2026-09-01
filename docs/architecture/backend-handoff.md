# Backend Handoff

Status: **CURRENT** · Updated 2026-08-28 — now describes the implementation, not only the contract

What the frontend expects — and, as of this revision, what the backend actually
does. The backend was implemented **against this contract**, not the other way
round: the frontend is frozen and is the reference implementation.

**Implementation status: all eleven wired endpoints are served.** Two contract
ambiguities surfaced during implementation and are recorded in §11.

```text
FRONTEND  →  packages/contracts  →  BACKEND API  →  ORCHESTRATION
                                                  →  MODEL ADAPTERS  →  MODELS
```

`packages/contracts/src` is the source of truth. Everything below is a
description of it, not a second definition. Where this document and the schemas
disagree, the schemas win.

---

## 1. Conventions

| Aspect | Expectation |
|---|---|
| Base path | `/api` |
| Auth transport | httpOnly cookies. The client reads no token and sets no `Authorization` header |
| CSRF | Client sends `X-Nexus-Client: web` on every request. Reject mutations without it, and validate `Origin` |
| Content type | `application/json`, except `POST /api/chat/stream` → `text/event-stream` |
| IDs | 24-char lowercase hex (Mongo ObjectId shape). `clientMessageId` is a 26-char ULID from the client |
| Timestamps | ISO 8601 UTC with milliseconds — `2026-08-19T14:03:22.481Z` |
| Model identifiers | Opaque strings chosen by the server (`ModelRef.modelId`). The client never parses them and never hardcodes one |
| Pagination | Cursor. Response carries `nextCursor: string \| null` |
| Errors | One envelope, always (§8) |

### What the client does on 401

`lib/http.ts` retries **once**, and only when the error code is
`TOKEN_EXPIRED`: it calls `POST /api/auth/refresh`, then replays the original
request. Concurrent 401s share a single refresh. Any other 401 code propagates
to the UI and signs the user out.

This means: **expired access tokens must return `TOKEN_EXPIRED`, not a generic
`UNAUTHENTICATED`**, or the client will sign users out instead of refreshing.

---

## 2. Authentication

| Method | Path | Body | Success |
|---|---|---|---|
| `POST` | `/api/auth/register` | `RegisterRequest` | `201 { user }` + both cookies |
| `POST` | `/api/auth/login` | `LoginRequest` | `200 { user }` + both cookies |
| `POST` | `/api/auth/logout` | — | `204`, cookies cleared, idempotent |
| `POST` | `/api/auth/refresh` | — | `204` with rotated cookies |
| `GET` | `/api/auth/me` | — | `200 { user }` |
| `PATCH` | `/api/auth/me` | `UpdateProfileRequest` | `200 { user }` — **contract defined, not yet called** |

`RegisterRequest` — email ≤254, password **4–128**, displayName 1–60 after trim.

The minimum was lowered from 12 to 4 as a product decision. It is a policy
change only: hashing remains Argon2id at OWASP parameters, and no composition
rule was added to compensate — length is the property that matters, and
"one symbol, one digit" pushes people toward `Passw0rd!`. `LoginRequest`
deliberately keeps `min(1)`: existing accounts predate any change to the rule,
and enforcing a registration minimum at sign-in would leak the policy.
The client enforces the same minimum in the UI and states it before submission.

`User.preferences` carries `theme`, `routingMode` and `pinnedModelId`. The
client reads `routingMode` to seed the composer's default selection; theme is
resolved client-side and persisted in `localStorage`, so the server value is
advisory.

**Login must not distinguish an unknown email from a wrong password** — same
code, same message, same timing. The client renders whatever `message` it is
given.

---

## 3. Models

`GET /api/models` → `ModelsResponse`

```jsonc
{
  "models": [ /* Model[] */ ],
  "auto": { "available": true },
  "checkedAt": "2026-08-19T14:03:20.000Z"
}
```

- `auto.available: false` **disables the composer** and shows
  "No real models are currently available." This is the client's only signal
  that nothing is routable; it must be accurate.
- `availability` is one of seven states; `isRoutable()` in the contract treats
  only `AVAILABLE` and `UNKNOWN` as selectable. Everything else renders in the
  selector as disabled, annotated with `availabilityReason` — so that string is
  user-facing copy, not a debug code.
- Routing internals — quality/speed/cost tiers, rank, the provider's own model
  id — are **deliberately absent from the wire shape**. Do not add them.
- `Cache-Control: private, max-age=30`. The client refetches on window focus.

---

## 4. Conversations

| Method | Path | Body | Success |
|---|---|---|---|
| `GET` | `/api/conversations?cursor=&limit=` | — | `200 ConversationListResponse` |
| `PATCH` | `/api/conversations/:id` | `RenameConversationRequest` (title 1–120) | `200`/`204` |
| `DELETE` | `/api/conversations/:id` | — | `204` |

**There is no `POST /api/conversations`.** A conversation is created as a side
effect of the first message on `/api/chat/stream`. The client navigates from
`/app` to `/app/chat/:id` on the `start` event. Adding a create endpoint would
reintroduce empty-conversation orphans.

`DELETE` returns `204` whether or not the row existed *for this user*.
Ownership failures are `404`, never `403` — a `403` confirms the id exists and
lets an attacker enumerate.

The client mutates optimistically and rolls back on error, so a failed rename or
delete must actually return non-2xx rather than silently no-op.

---

## 5. Messages

`GET /api/conversations/:id/messages?cursor=&limit=` → `MessageListResponse`

Each `Message` carries `content`, `status`, `synthesisModel`, `responses[]`,
`agreement`, `sources[]` and `metadata`.

Three constraints the client depends on:

1. **`streaming` is not a wire state.** `MessageStatus` has no such member. A
   row interrupted by a crash must be read back as `failed`, never presented as
   in flight.
2. **`agreement.responded` is how many models actually answered**, and may be
   lower than `requested`. The client renders "THREE OF FOUR RESPONDED" from
   this. Do not report `responded === requested` when a model failed.
3. **`stance` is never guessed.** `unknown` is a legitimate value used when a
   model failed or could not be classified. The provenance rail renders stance
   as fact, so a guess becomes a lie on screen.

Pagination is defined and **not yet consumed** — the client loads the first page
only. Returning `nextCursor` is correct; the client will ignore it for now.

---

## 6. Chat streaming

`POST /api/chat/stream`, body `ChatRequest`, response `200 text/event-stream`.

```jsonc
{
  "conversationId": "6650…" | null,     // null creates the conversation
  "message": "…",                        // 1–32000 chars after trim
  "selection": { "mode": "auto", "routing": "single|balanced|thorough" }
             | { "mode": "manual", "modelId": "…" },
  "clientMessageId": "01J8…"             // ULID, 26 chars
}
```

### Event order

```text
start                       conversationId, messageId, plan[], mode
model_start      × N        one per planned model
model_complete   × N        modelId, FULL text, outcome, latency, tokens
model_error      (any)      modelId, code, message
synthesis_start             the synthesising model
delta            × many     synthesis text only
agreement                   counts + per-model stance map
sources                     optional
complete                    messageId, latencyMs, firstTokenMs
```

Terminal alternatives: `error` (with `partial: boolean`) or `cancelled`.

### The load-bearing decision

**Per-model text is not streamed.** Models emit `model_start` so the rail can
show them in flight, then `model_complete` carrying the whole response. Only the
synthesis streams token by token.

This is a product decision, not an optimisation: four columns of racing text is
a slot machine, and streaming every model's tokens costs four times the
bandwidth for output the reader cannot use yet. Do not "improve" this by adding
per-model deltas — the client reducer has no state for them.

### Wire format

SSE frames, `data: {json}\n\n`. Send `: keepalive` comments periodically; the
client's parser skips them. Set `X-Accel-Buffering: no` and
`Cache-Control: no-transform` or intermediaries will buffer the stream and it
will arrive all at once.

The client uses `fetch` + `ReadableStream`, **not `EventSource`** — it needs a
POST body, a custom header, and cancellation the server observes. It does not
want automatic reconnection, which would silently bill a second generation.

### Preflight vs in-stream errors

Failures **before** the stream opens are a normal 4xx with the JSON envelope.
Once `200` is committed, every failure is an `error` event inside the stream.

| Preflight failure | Status | Code |
|---|---|---|
| Body invalid | 400 | `VALIDATION_ERROR` |
| Not authenticated | 401 | `UNAUTHENTICATED` |
| Conversation not owned / missing | 404 | `NOT_FOUND` |
| Manual model unknown | 404 | `MODEL_NOT_FOUND` |
| Manual model unavailable | 409 | `MODEL_UNAVAILABLE` |
| No routable model | 503 | `NO_MODEL_AVAILABLE` |
| Too long for every context window | 413 | `CONTEXT_TOO_LONG` |
| Duplicate `clientMessageId` within 60s | 409 | `DUPLICATE_REQUEST` |
| Rate limited | 429 | `RATE_LIMITED` |

### Cancellation

The client aborts the `fetch`. That request abort **is** the cancellation
signal — there is no cancel endpoint and the client will not call one.

On abort the server must: stop the provider calls, persist whatever synthesis
text was produced with status `cancelled`, and — best effort — emit `cancelled`.
The client does not depend on receiving it; it marks the turn cancelled locally
on abort. Partial text is always retained and shown.

**A message must never be left in a non-terminal state.** Finalise on abort, on
disconnect, and on shutdown.

---

## 7. Idempotency

`clientMessageId` is a ULID. The same value twice within 60 seconds for the same
user must return `409 DUPLICATE_REQUEST` rather than generating twice. This
protects against a double submit and a retry over a flaky network — both of
which otherwise cost money and produce two divergent answers.

---

## 8. Errors

Every non-2xx JSON response, without exception:

```jsonc
{
  "error": {
    "code": "MODEL_UNAVAILABLE",
    "message": "Claude Sonnet 4.5 is temporarily unavailable.",
    "requestId": "01J8XQ…",
    "details": [ { "path": "message", "message": "…" } ],
    "retryAfterSeconds": 30
  }
}
```

- `message` is **rendered directly to the user**. It must be presentable: no
  stack trace, no provider body, no internal identifier.
- `details[].path` must match the client's field names (`email`, `password`,
  `displayName`) — the forms attach errors to inputs by that path.
- `code` must be a member of `ErrorCode`. Unknown codes fall back to a generic
  message, losing the specific one.
- When the envelope is absent (a gateway answered instead), the client maps to
  `INTERNAL` and shows "Something went wrong."

`errorMessages` in the contract holds the client's fallback copy per code, so
the two cannot drift.

---

## 9. What the backend must not do

- **Do not change `packages/contracts` to match an implementation.** The
  contract is the boundary; the frontend is frozen against it.
- **Do not add fields to `ModelsResponse`** for routing internals.
- **Do not stream per-model deltas.**
- **Do not return `403`** for a resource owned by another user.
- **Do not send provider names, keys, stack traces or upstream bodies** in any
  response.
- **Do not invent metadata.** Null is a valid value for token counts and
  `firstTokenMs`. The UI renders absence correctly; it cannot detect a
  fabricated number.

---

## 10. Verifying integration

The frontend is already wired. When endpoints come up, these become testable in
order:

1. `GET /api/auth/me` → 401 → the app redirects to `/login?next=…`
2. `POST /api/auth/register` → the workspace loads
3. `GET /api/models` → the model selector populates; `auto.available: false`
   disables the composer
4. `GET /api/conversations` → the sidebar groups by recency
5. `POST /api/chat/stream` → the rail fills as `model_complete` events arrive,
   the synthesis streams, `agreement` sets stances
6. Abort mid-stream → partial retained, message finalised `cancelled`
7. Reload → history restores identically from `GET …/messages`

All seven have been walked through the running stack with the deterministic
adapter. None has been exercised against a real model provider.

---

## 11. Ambiguities found during implementation

Recorded rather than silently resolved.

### 11.1 Event names

The implementation brief named the synthesis events `synthesis_delta` and
`synthesis_complete`. `packages/contracts` and the frozen client reducer use
**`delta`** and **`complete`**. The contract is the boundary, so the contract
won. No schema was changed.

### 11.2 `concur + diverge` need not equal `responded`

`Stance` is only assigned when the synthesis pass actually classified a model;
otherwise it stays `unknown` (see
[ADR-014](../decisions/ADR-014-synthesis-and-stance.md)). So `Agreement` can
legitimately carry `responded: 3, concur: 0, diverge: 0`.

The frozen client read `diverge === 0` as unanimity and rendered
**"ALL CONCUR"** for turns where nothing had been judged — a fabricated claim.
The contract was already correct and was left alone; `frontend/src/lib/format.ts`
was fixed and given regression tests. This is the one frontend change the
backend phase required, and it was a correctness fix, not an accommodation.

### 11.3 Sources

`Source` is fully typed and the `sources` event is emitted, always with an empty
list. No adapter extracts sources and none is fabricated.

The contract is not the obstacle — `Source` already describes the right thing.
The obstacle is that it describes a *retrieved document* (`url`, `domain`,
`snippet`, `retrievedAt`), and nothing in this system retrieves: every adapter
sends a plain chat-completions request with no search or grounding tool. Filling
it therefore needs provider-side grounding, which is a feature with its own cost,
latency and per-model availability semantics. Scraping URLs out of a model's
prose is refused permanently — nobody fetched them, so the snippet and timestamp
would be invented. [ADR-018](../decisions/ADR-018-sources-remain-planned.md).

### 11.4 Model output is untrusted input

The synthesis stage reads other vendors' text beside its own instructions. Each
untrusted section — every model response and the user's question — is fenced
with a random per-turn label, so a response cannot close its section and issue
instructions. Content is passed through byte for byte rather than escaped.
[ADR-017](../decisions/ADR-017-synthesis-trust-boundary.md).
