# 37–43 · Security & Operations

Status: **CURRENT** — scope-independent. Describes the intended server posture; no backend implements it yet.

## 37. Authentication

### 37.1 Password storage

**Argon2id** via `@node-rs/argon2`.

```ts
{ algorithm: 'argon2id', memoryCost: 19456 /* 19 MiB */, timeCost: 2, parallelism: 1, outputLen: 32 }
```

These are the OWASP-recommended baseline parameters. They are pinned in code with a comment
explaining that raising them is safe (old hashes carry their own parameters and are re-hashed on next
successful login) but lowering them is not. bcrypt is rejected: it caps input at 72 bytes and is far
weaker against GPU attack.

Password rules: 12–128 characters. **No composition requirements** — no forced symbol, no forced
digit. Composition rules measurably reduce entropy by pushing users toward `Password1!`. Length is
the requirement that matters. The minimum is stated on the form before submission, not discovered
through rejection.

### 37.2 Session strategy

Two tokens, both in httpOnly cookies. **No token is ever readable by JavaScript.**

| | Access token | Refresh token |
|---|---|---|
| Cookie | `nx_at` | `nx_rt` |
| Lifetime | 15 minutes | 30 days |
| Algorithm | EdDSA (Ed25519) via `jose` | Opaque 256-bit random, base64url |
| Contents | `{ sub, sid, iat, exp, iss, aud }` | nothing — it is a lookup key |
| Storage | stateless, verified by public key | Redis: `session:{tokenHash}` → `{ userId, familyId, expiresAt }` |
| `Path` | `/` | `/api/auth` |
| `SameSite` | `Lax` | `Strict` |
| `HttpOnly` `Secure` | yes, yes | yes, yes |

**Why not `localStorage`.** A token in `localStorage` is readable by any XSS, including one
introduced by a future dependency. httpOnly cookies are not. The cost is that we must handle CSRF
(§39.2), which is a smaller and better-understood problem than XSS token theft.

**Why the access token is a JWT but the refresh token is not.** The access token must be verifiable
without a network call on every request — that is what stateless signing is for. The refresh token
must be *revocable*, which a stateless token fundamentally is not. Using the right mechanism for each
job avoids the common mistake of a long-lived stateless token that cannot be invalidated.

**Why 15 minutes.** Long enough that refresh traffic is negligible (4/hour/user), short enough that a
leaked access token has a small window. Logout revokes the refresh family immediately; the access
token remains valid for up to 15 minutes, which is an accepted and documented trade-off. Immediate
access-token revocation would require a per-request denylist check, converting a stateless token into
a stateful one and removing the entire benefit.

### 37.3 Refresh rotation with reuse detection

```text
POST /api/auth/refresh with nx_rt = T1
  → look up session:sha256(T1)
  → not found or expired → 401 SESSION_EXPIRED
  → found and already rotated → REUSE DETECTED:
        delete every session in familyId, log security event, 401 SESSION_REVOKED
  → valid → mint T2, store session:sha256(T2) with the same familyId,
            mark T1 rotated with a 60s grace TTL, set both cookies
```

The **60-second grace window** on the rotated token exists because a real browser can fire two
refreshes concurrently (two tabs, or a request racing a retry). Without grace, normal usage would
trip reuse detection and log people out. With grace, a genuine replay hours later is still caught.

Refresh tokens are stored as SHA-256 hashes, so a Redis dump does not yield usable tokens.

### 37.4 Signing keys

`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` are PEM Ed25519 keys supplied by the environment. The process
refuses to start if either is missing or malformed — there is no development fallback that generates
an ephemeral key, because that pattern reliably escapes into production.

Key rotation: the verifier accepts a set of public keys identified by `kid`; the signer uses one.
Rotation is therefore: add the new public key, deploy, switch the signer, deploy, remove the old
public key after 15 minutes (one access-token lifetime).

---

## 38. Authorization

### 38.1 Identity comes from one place

```ts
// The ONLY source of the acting user's identity.
const userId = request.user.id;   // set by the auth hook after verifying nx_at
```

`request.body.userId`, `request.query.userId`, and `request.params.userId` **do not exist in the
schema**. A Zod schema that does not define a field strips it, so even a malicious client sending
`{"userId": "..."}` cannot get that value into a handler. This is stronger than remembering not to
read it — the value is not reachable.

### 38.2 Ownership is a query filter, not a check

The pattern used everywhere:

```ts
// correct — ownership is part of the query
const conversation = await conversations.findOne({ _id: id, userId });
if (!conversation) throw new NotFoundError();

// forbidden — a check that can be forgotten, or that leaks existence
const conversation = await conversations.findOne({ _id: id });
if (conversation.userId !== userId) throw new ForbiddenError();
```

Two consequences, both intentional:

1. **Forgetting the filter cannot leak data**, because there is no separate check to forget — the
   filter *is* the authorization.
2. **A resource owned by someone else returns `404`, never `403`.** A `403` confirms the resource
   exists, which lets an attacker enumerate valid conversation IDs. `404` reveals nothing.

Enforced by a test that scans `infrastructure/mongodb/*-repository.ts` for any `find`, `update`, or
`delete` call whose filter does not include `userId`, and fails the build on a match.

### 38.3 Authorization matrix

| Resource | Read | Write | Delete |
|---|---|---|---|
| Own user | ✓ | ✓ (displayName, preferences) | ✗ (out of MVP scope) |
| Other user | ✗ (404) | ✗ | ✗ |
| Own conversation | ✓ | ✓ (title) | ✓ (cascades to messages) |
| Other conversation | ✗ (404) | ✗ (404) | ✗ (404) |
| Own message | ✓ | ✗ (immutable) | ✓ via conversation delete, or regenerate |
| Other message | ✗ (404) | ✗ | ✗ |
| Model catalog | ✓ (authenticated) | ✗ | ✗ |
| Provider credentials | ✗ **nobody, ever** | ✗ | ✗ |

There are no roles, no admin, no sharing. Every authenticated user has identical permissions over
their own data and none over anyone else's. Adding a role system before a second role exists is the
premature abstraction the brief forbids.

---

## 39. Security

### 39.1 Provider secret containment

Six mechanisms, layered:

1. **Backend-only reads.** Provider keys are read exactly once, in `config/env.ts`, at boot, into a
   frozen object. No other module reads `process.env` for a provider key.
2. **No `VITE_` provider variables.** Vite only exposes variables prefixed `VITE_`. A CI check fails
   the build if any `VITE_*` name matches `/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i`.
3. **Bundle scan.** After the production build, a CI step greps the emitted bundle for every known
   provider key pattern (`AIza…`, `sk-…`, `sk-ant-…`, `gsk_…`, `nvapi-…`). A match fails the build.
4. **Log redaction.** Pino is configured with explicit redaction paths, plus a serializer that
   rewrites any string matching a provider-key pattern to `[REDACTED]` regardless of where it appears.
5. **Error sanitization.** Upstream error bodies never reach a response. `AppError` carries a
   `userMessage` (returned) and a `context` (logged only). The HTTP error handler serializes only
   `userMessage`.
6. **No echo endpoint.** No route returns configuration, environment, or provider settings. Even
   `/health/ready` reports only `ok`/`fail` per dependency — never which providers are configured.

### 39.2 CSRF

Cookie authentication requires CSRF defense. Three layers, chosen over a token-in-form scheme
because they add no state and no user-visible failure mode:

1. **`SameSite`** — `Lax` on the access cookie blocks cross-site POSTs outright in every current
   browser. `Strict` on the refresh cookie means even a top-level cross-site navigation cannot
   trigger a refresh.
2. **Origin allowlist** — every mutating request must carry `Origin` (or `Referer`) matching
   `WEB_ORIGIN` exactly. Missing origin on a state-changing request is rejected.
3. **Custom header** — `X-Nexus-Client: web` is required on every mutating request. A cross-origin
   form or image cannot set a custom header; attempting it forces a CORS preflight, which our CORS
   policy denies. This also makes `POST /api/chat/stream` unreachable by `<form>` submission.

### 39.3 Timing and enumeration resistance

- Login runs an Argon2 verification against a **fixed dummy hash** when the email is unknown, so the
  response time does not distinguish "no such user" from "wrong password".
- Registration returns `409 EMAIL_TAKEN`, which does disclose existence — unavoidable for a
  self-service signup form, and rate-limited to 5 attempts per 15 minutes per IP+email.
- All ownership failures are `404`.

### 39.4 Security headers

```text
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self';
  font-src 'self';
  img-src 'self' data:;
  connect-src 'self';
  form-action 'none';
  frame-ancestors 'none';
  base-uri 'none';
  object-src 'none';
  upgrade-insecure-requests
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

**No `'unsafe-inline'` for scripts.** The one inline script — the pre-paint theme bootstrap — carries
a per-build nonce injected by the Vite HTML plugin. Tailwind emits a static stylesheet, so
`style-src 'self'` is sufficient and no inline style allowance is needed. `form-action 'none'`
because the app has no real form submissions — everything is `fetch`.

`connect-src 'self'` is notable: the browser is structurally incapable of reaching a provider API
directly, which makes Rule 5 enforceable by the browser rather than only by our discipline.

### 39.5 CORS

```ts
{ origin: [config.WEB_ORIGIN], credentials: true,
  methods: ['GET','POST','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','X-Nexus-Client','X-Request-Id'],
  exposedHeaders: ['X-Request-Id','RateLimit-Limit','RateLimit-Remaining','RateLimit-Reset'],
  maxAge: 600 }
```

A single exact origin from configuration. No wildcard, no regex, no reflected `Origin`. Reflecting
the request origin with `credentials: true` is the canonical way to accidentally disable CORS
entirely.

### 39.6 Input limits

| Limit | Value | Why |
|---|---|---|
| Request body | 256 KB | A 32,000-char message plus overhead. Fastify rejects larger before parsing |
| Message length | 32,000 chars | Bounded prompt cost |
| Conversation title | 120 chars | Storage and UI bound |
| Email | 254 chars | RFC limit |
| Password | 128 chars | Argon2 input bound; also prevents a 10MB-password DoS |
| Display name | 60 chars | UI bound |
| URL length | 2 KB | Fastify default |
| Header size | 8 KB | Fastify default |
| Page size | 100 max, 50 default | Bounded query cost |
| Concurrent streams per user | 3 | Prevents one account exhausting the pool |

### 39.7 Output safety

Model output is untrusted input. It is rendered by `react-markdown` into a React element tree —
**there is no `dangerouslySetInnerHTML` anywhere in the codebase**, enforced by an ESLint rule. Raw
HTML in markdown is not parsed at all (`remark-gfm` without `rehype-raw`), so `<script>` in a model
response renders as literal text.

Link handling: `target="_blank" rel="noopener noreferrer nofollow"`, and only `http:`, `https:`, and
`mailto:` schemes are rendered as links — `javascript:`, `data:`, and `vbscript:` render as plain
text. Code blocks are never executed, never `eval`'d, and carry `translate="no"`.

### 39.8 Dependency and supply chain

`pnpm` with a committed lockfile and `--frozen-lockfile` in CI. `pnpm audit --audit-level=high` fails
the build. Dependabot weekly, grouped. `overrides` pins transitive versions when an advisory has no
direct upgrade path. New dependencies require the justification table entry from
[§18.1](../frontend/architecture.md#181-dependency-ledger) or [§21.2](../backend/architecture.md#212-dependency-ledger) — a
dependency without a written justification is rejected in review.

### 39.9 Threat model summary

| Threat | Mitigation |
|---|---|
| XSS → token theft | httpOnly cookies; no `dangerouslySetInnerHTML`; strict CSP with nonce |
| CSRF | SameSite + Origin allowlist + custom header |
| IDOR / cross-user access | `userId` in every query filter; 404 not 403; repository scan test |
| Credential stuffing | Argon2id; rate limit 5/15min; constant-time failure |
| Session hijack | httpOnly + Secure + rotation + reuse detection kills the family |
| Provider key exfiltration | Six-layer containment (§39.1); `connect-src 'self'` |
| Prompt injection in model output | Output is data: no HTML parsing, no tool execution in MVP, no link scheme escape |
| Enumeration | 404 for all ownership failures; constant-time login |
| DoS / cost abuse | Body limits; per-user chat rate limits; 3 concurrent streams; 45s budget; provider timeouts |
| Log leakage | Explicit redaction paths + pattern-based serializer; message content logged only at `trace`, never enabled in production |

---

## 40. Redis

### 40.1 Key inventory

Every key is enumerated. An undocumented key is a review failure.

| Key | Type | TTL | Purpose |
|---|---|---|---|
| `session:{sha256(refreshToken)}` | hash | 30d | `{ userId, familyId, rotatedAt? }` |
| `session:family:{familyId}` | set | 30d | Token hashes in the family, for mass revocation |
| `ratelimit:{class}:{key}` | sorted set | window | Sliding-window counters |
| `provider:health:{providerId}` | hash | 180s | `{ ok, latencyMs, checkedAt, consecutiveFailures, errorCode? }` |
| `provider:breaker:{providerId}` | hash | 600s | `{ state, failures, openedAt, cooldownMs }` |
| `provider:health:lock:{providerId}` | string | 55s | Single-prober lock, `SET NX PX` |
| `idem:{userId}:{clientMessageId}` | string | 60s | Duplicate-send suppression |
| `stream:count:{userId}` | string | 300s | Concurrent stream counter (`INCR`/`DECR`) |

No key holds message content, prompt text, or model output. Redis is coordination state, not a data
store, and never the only copy of anything a user typed.

### 40.2 Degradation policy — per subsystem, deliberately different

Redis being down must not take the product down, but "fail open" is not universally correct.

| Subsystem | Redis unavailable | Direction | Reasoning |
|---|---|---|---|
| Session lookup | **Fail closed** — refresh returns 401 | closed | Accepting an unverifiable refresh token would be an authentication bypass. Users with a valid access token keep working for up to 15 minutes |
| Auth rate limiting | **Fail closed** — reject with 503 | closed | An unlimited login endpoint is a credential-stuffing gift. Better to be briefly unavailable |
| Chat rate limiting | **Fail open** — allow | open | The downside is cost, bounded by provider limits; the downside of closing is the product not working |
| Provider health | Fall back to `UNKNOWN` | open | Routing continues with a scoring penalty (§28.2) |
| Circuit breaker | Per-instance in-memory | open | Degraded but functional |
| Idempotency | **Fail open** — allow | open | A rare duplicate response is better than a blocked send |
| Concurrent stream cap | **Fail open** — allow | open | Cost-control nicety, not a correctness guarantee |

This table is the specification. "Redis is down, what happens" is answered per subsystem, not
globally, because a single global answer is wrong for at least two of the seven.

### 40.3 Configuration

`ioredis` with `maxRetriesPerRequest: 2`, `enableOfflineQueue: false` (fail fast rather than queue
into a growing buffer), `connectTimeout: 3000`, exponential reconnect capped at 2s. Every call site
wraps Redis in a helper that catches connection errors and applies the §40.2 policy — no call site
lets a Redis error escape as a 500.

Production requires AOF persistence (`appendonly yes`, `appendfsync everysec`). Without it, a Redis
restart logs out every user. This is a documented deployment requirement, not an assumption.

### 40.4 What Redis is not used for

- **Not a cache for conversations or messages.** Mongo with correct indexes answers these in
  single-digit milliseconds. A cache would add invalidation bugs for no measured gain.
- **Not a pub/sub bus.** Nothing needs cross-instance messaging in MVP.
- **Not a job queue.** There are no background jobs beyond the health prober, which is a timer.
- **Not a stream buffer.** Deltas live in process memory (§24.3).

---

## 41. Error Architecture

### 41.1 Three representations of one failure

```text
Cause              Internal AppError              HTTP / SSE                 UI
─────────────────  ─────────────────────────────  ─────────────────────────  ──────────────────────
provider 503       code: PROVIDER_UNAVAILABLE     503 { error: { code,       "The model provider
                   status: 503                        message, requestId }}  is unavailable."
                   retryable: true                or SSE error event         + Try again
                   userMessage: "…"
                   context: { provider, model,
                     upstreamStatus, upstreamBody,
                     attempt, latencyMs }         ← never serialized
```

`context` is for logs. `userMessage` is for people. They are separate fields on the class, so leaking
internals requires actively choosing the wrong field rather than forgetting to sanitize.

### 41.2 `AppError`

```ts
class AppError extends Error {
  constructor(readonly code: ErrorCode,
              readonly userMessage: string,
              readonly options: {
                status: number;
                retryable: boolean;
                affectsProviderHealth: boolean;
                context?: Record<string, unknown>;
                cause?: unknown;
              }) { super(`${code}: ${userMessage}`); }
}
```

One class, not a hierarchy of twenty subclasses. The code is data; behavior is driven by the flags.
A `TimeoutError extends ProviderError extends AppError` chain would add three files and zero
capability — the exact "interfaces that exist only because SOLID" pattern the brief forbids.

Construction goes through named factories so the flags are never set inconsistently:

```ts
export const Errors = {
  timeout:            (ctx) => new AppError('TIMEOUT', 'The model took too long to respond.',
                                { status: 504, retryable: true,  affectsProviderHealth: true,  context: ctx }),
  providerUnavailable:(ctx) => new AppError('PROVIDER_UNAVAILABLE', 'The model provider is unavailable.',
                                { status: 503, retryable: true,  affectsProviderHealth: true,  context: ctx }),
  contentPolicy:      (ctx) => new AppError('CONTENT_POLICY', 'The model declined to answer this request.',
                                { status: 422, retryable: false, affectsProviderHealth: false, context: ctx }),
  notFound:           ()    => new AppError('NOT_FOUND', 'Not found.',
                                { status: 404, retryable: false, affectsProviderHealth: false }),
  // …one factory per code
};
```

### 41.3 Complete code table

| Code | Status | Retryable | Health | User message |
|---|---|---|---|---|
| `VALIDATION_ERROR` | 400 | ✗ | ✗ | field-specific |
| `UNAUTHENTICATED` | 401 | ✗ | ✗ | `Sign in to continue.` |
| `TOKEN_EXPIRED` | 401 | ✗ | ✗ | (client refreshes silently) |
| `SESSION_EXPIRED` | 401 | ✗ | ✗ | `Your session expired. Sign in to continue.` |
| `SESSION_REVOKED` | 401 | ✗ | ✗ | `You've been signed out for security reasons.` |
| `INVALID_CREDENTIALS` | 401 | ✗ | ✗ | `That email or password is incorrect.` |
| `EMAIL_TAKEN` | 409 | ✗ | ✗ | `An account with that email already exists.` |
| `NOT_FOUND` | 404 | ✗ | ✗ | `Not found.` |
| `MODEL_NOT_FOUND` | 404 | ✗ | ✗ | `That model isn't available.` |
| `MODEL_NOT_CONFIGURED` | 409 | ✗ | ✗ | `{Model} is not configured on this server.` |
| `MODEL_UNAVAILABLE` | 409 | ✗ | ✗ | `{Model} is temporarily unavailable.` |
| `NO_MODEL_AVAILABLE` | 503 | ✗ | ✗ | `No real models are currently available.` |
| `CONTEXT_TOO_LONG` | 413 | ✗ | ✗ | `This conversation is too long for the selected model.` |
| `DUPLICATE_REQUEST` | 409 | ✗ | ✗ | (silently ignored by client) |
| `RATE_LIMITED` | 429 | ✓ after delay | ✗ | `You've sent too many requests. Try again in {n} seconds.` |
| `TIMEOUT` | 504 | ✓ | ✓ | `The model took too long to respond.` |
| `NETWORK_ERROR` | 502 | ✓ | ✓ | `Couldn't reach the model provider.` |
| `PROVIDER_UNAVAILABLE` | 503 | ✓ | ✓ | `The model provider is unavailable.` |
| `PROVIDER_ERROR` | 502 | ✓ | ✓ | `The model provider returned an error.` |
| `AUTH_ERROR` | 502 | ✗ | ✓ | `That model isn't available right now.` |
| `CONTENT_POLICY` | 422 | ✗ | ✗ | `The model declined to answer this request.` |
| `INVALID_REQUEST` | 502 | ✗ | ✗ | `Something went wrong while generating the response.` |
| `CANCELLED` | 499 | ✗ | ✗ | `Stopped.` |
| `SERVER_SHUTDOWN` | 503 | ✓ | ✗ | `The server is restarting. Try again in a moment.` |
| `DATABASE_ERROR` | 503 | ✓ | ✗ | `Something went wrong. Try again.` |
| `INTERNAL` | 500 | ✗ | ✗ | `Something went wrong.` |

`AUTH_ERROR` — a bad provider API key — deliberately does **not** say "the API key is invalid" to the
user. That is an operator problem, and disclosing it tells an attacker about server configuration.
It is logged at `error` with full context so the operator sees it immediately.

### 41.4 Provider error classification

```text
HTTP 400 + body mentions token/length/context  → CONTEXT_TOO_LONG
HTTP 400                                       → INVALID_REQUEST
HTTP 401, 403                                  → AUTH_ERROR
HTTP 404                                       → MODEL_NOT_FOUND
HTTP 422 + safety/policy/blocked in body       → CONTENT_POLICY
HTTP 429                                       → RATE_LIMIT
HTTP 500, 502, 504                             → PROVIDER_ERROR
HTTP 503                                       → PROVIDER_UNAVAILABLE
ECONNREFUSED, ENOTFOUND, ECONNRESET, EPIPE     → NETWORK_ERROR
AbortError from our own signal                 → CANCELLED
AbortError from a timeout signal               → TIMEOUT
anything else                                  → UNKNOWN (logged at error with the raw shape)
```

Each provider adapter additionally maps its own idiosyncratic in-band failures — Gemini's
`promptFeedback.blockReason`, Anthropic's `stop_reason: "refusal"`, OpenAI's
`finish_reason: "content_filter"` — to `CONTENT_POLICY`. Those quirks are the only provider-specific
knowledge in the system and they live in the adapter, which is exactly where §25.4 requires them.

### 41.5 The single mapping point

`app/error-handler.ts` is the only file that converts an error into an HTTP response. Route handlers
throw; they never construct an error response. This means the redaction guarantee holds in exactly
one place instead of at every throw site.

Unknown thrown values (a string, a `TypeError` from our own code) become `INTERNAL` with the original
logged at `error` including the stack. The user sees `Something went wrong.` and a `requestId`.

---

## 42. Logging

### 42.1 Configuration

```ts
pino({
  level: config.LOG_LEVEL,                     // production: 'info'
  redact: {
    paths: [
      'req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]',
      'password', '*.password', 'passwordHash', '*.passwordHash',
      'apiKey', '*.apiKey', 'context.apiKey', 'context.upstreamHeaders',
      'refreshToken', 'accessToken', '*.token',
    ],
    censor: '[REDACTED]',
  },
  serializers: { err: sanitizeError },          // strips provider-key patterns from any string
  formatters: { level: (label) => ({ level: label }) },
})
```

The pattern-based serializer is a second line of defense: even if a key reaches a log field nobody
anticipated, `AIza[\w-]{35}`, `sk-[\w]{20,}`, `sk-ant-[\w-]{20,}`, `gsk_[\w]{20,}`, and
`nvapi-[\w-]{20,}` are rewritten before the line is emitted. Path-based redaction alone assumes we
predicted every path, which we will not.

### 42.2 Levels

| Level | Used for |
|---|---|
| `fatal` | Boot failure, unrecoverable dependency loss. Process exits |
| `error` | 5xx, unhandled exceptions, provider `AUTH_ERROR`, breaker opening, refresh reuse detected |
| `warn` | 4xx that indicate a problem (rate limit hit, repeated validation failure), failover occurred, provider degraded, Redis unavailable |
| `info` | Request completion, auth events, conversation created/deleted, routing decision, stream completed/cancelled |
| `debug` | Health probe results, cache decisions, attempt sequencing. Off in production |
| `trace` | Prompt and response content. **Never enabled in production**; guarded by an explicit `ALLOW_CONTENT_LOGGING` flag that defaults false and is asserted false when `NODE_ENV === 'production'` |

### 42.3 Structured fields

Every log line carries: `time`, `level`, `requestId`, `msg`. Where applicable it also carries
`userId`, `conversationId`, `messageId`, `provider`, `modelId`, `routingMode`, `taskClass`,
`durationMs`, `firstTokenMs`, `status`, `errorCode`, `attempt`, `failover`.

```jsonc
{"level":"info","time":"2026-08-18T14:03:24.621Z",
 "requestId":"01J8XQ7K3M2N4P5Q6R7S8T9V0W","userId":"6650…","conversationId":"6651…",
 "messageId":"6652…","msg":"chat stream completed","routingMode":"auto","taskClass":"CODE",
 "provider":"google","modelId":"gemini-2.5-flash","candidateCount":4,"selectedScore":0.812,
 "firstTokenMs":380,"durationMs":2140,"outputTokens":512,"finishReason":"stop","attempt":1,
 "failover":null}
```

### 42.4 Never logged

Passwords, password hashes, provider API keys, JWTs, refresh tokens, cookie headers, `Set-Cookie`
values, full email addresses at `info` or above (the local part is truncated: `om***@example.com`),
prompt content, model output content.

Message content is logged only at `trace`. This is a deliberate operational cost: debugging a
"the model gave a weird answer" report requires the user to paste the content, because we chose not
to retain it in logs.

---

## 43. Observability

### 43.1 The honesty rule for observability

Every metric is derived from a real event in the request path. There is no synthetic data, no
placeholder dashboard, no "provider health" number computed from anything other than actual probe
and request outcomes. If a metric has no data yet, it is absent — not zero, not estimated.

### 43.2 Metrics

Prometheus text format at `GET /metrics`, bound to an internal port or protected by a bearer token —
never publicly reachable, because label values enumerate configured providers.

**Counters**

```text
nexus_http_requests_total{method,route,status}
nexus_auth_events_total{event}                       # register|login|logout|refresh|reuse_detected
nexus_chat_requests_total{mode,task_class}
nexus_chat_outcomes_total{outcome}                   # complete|cancelled|failed
nexus_provider_attempts_total{provider,model,outcome}
nexus_provider_errors_total{provider,error_code}
nexus_failovers_total{from_provider,to_provider,reason}
nexus_breaker_transitions_total{provider,to_state}
nexus_rate_limit_hits_total{class}
nexus_routing_selections_total{provider,model,mode}
nexus_db_errors_total{operation}
nexus_redis_degradations_total{subsystem}
```

**Histograms**

```text
nexus_http_duration_seconds{route}                   # buckets .01 .05 .1 .25 .5 1 2.5 5
nexus_first_token_seconds{provider,model}            # buckets .2 .5 1 2 5 10 30
nexus_generation_duration_seconds{provider,model}
nexus_provider_health_latency_seconds{provider}
nexus_mongo_operation_seconds{operation}
```

**Gauges**

```text
nexus_active_streams
nexus_provider_availability{provider,model}          # 1 AVAILABLE, 0.5 UNKNOWN, 0 unroutable
nexus_breaker_state{provider}                        # 0 closed, 1 half_open, 2 open
```

### 43.3 Health endpoints, again with intent

| Endpoint | Checks | Failure meaning |
|---|---|---|
| `/health/live` | Nothing external. Returns 200 if the event loop is responsive | Restart the container |
| `/health/ready` | Mongo `ping`, Redis `ping`, both with 1s timeout | Stop routing traffic here, do not restart |

Provider availability is deliberately **excluded from readiness**. A provider outage is not an
instance problem; marking every instance unready would take the whole product down in response to a
third party's incident. Provider state is a metric and a routing input, never a liveness signal.

### 43.4 Routing decisions are observable

Every routing decision is logged with its inputs and its score, because "why did it pick that model"
is the question that will be asked most often. `RoutingRecorder` emits:

```jsonc
{"level":"info","msg":"routing decision","requestId":"…","mode":"auto","taskClass":"CODE",
 "candidates":[{"modelId":"claude-sonnet-4-5","score":0.750,"availability":"AVAILABLE"},
               {"modelId":"gemini-2.5-flash","score":0.738,"availability":"AVAILABLE"},
               {"modelId":"mistral-large-2","score":0.535,"availability":"UNKNOWN"}],
 "selected":"claude-sonnet-4-5","excluded":[{"modelId":"mock","reason":"TEST_ONLY"},
                                            {"modelId":"gpt-5","reason":"NOT_CONFIGURED"}]}
```

The `excluded` array with reasons is what makes a routing complaint debuggable in one log line
instead of a bisect.

### 43.5 What is not built

No custom dashboard UI. No admin panel. No in-app observability screen. Metrics go to whatever the
deployment target already runs (Grafana, Datadog, CloudWatch). Building a dashboard inside the
product would be building the "infrastructure dashboard" the product definition explicitly rejects —
and a fake one would violate Rule 1.

Distributed tracing is not implemented. With a single service and one outbound call class, the
structured `requestId` in logs provides the same correlation for a fraction of the complexity. The
seam for adding OpenTelemetry later is `request-context.ts`, which already threads a per-request
context object.
