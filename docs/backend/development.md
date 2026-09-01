# Backend Development

Status: **CURRENT** · Updated 2026-08-28

## Prerequisites

Node 22+, pnpm 9, and a running MongoDB 8. No Redis — see
[ADR-013](../decisions/ADR-013-backend-stack-and-no-redis.md).

## Setup

```bash
pnpm install
```

```bash
pnpm backend:keys
```

Copy `backend/.env.example` to `backend/.env`, paste the generated keypair into
`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`, and point `MONGODB_URI` at your instance.

For development without provider credentials, set `TEST_PROVIDER_ENABLED=true`.
That enables three deterministic in-process models so the full orchestration
path can be exercised. Config **refuses to start** with it true when
`NODE_ENV=production`.

## Running

```bash
pnpm backend:dev
```

```bash
pnpm dev
```

Backend on 8080, frontend on 5173 with `/api` proxied to it — same-origin, so
cookies and CSRF behave exactly as they will in production.

## Verifying it works

```bash
curl -s localhost:8080/health/ready
```

Then register through the UI at http://localhost:5173/register and send a
message. With the test provider enabled you should see three `model_start`
events, three `model_complete`, then the synthesis stream.

## Tests

```bash
pnpm --filter @nexusai/backend test
```

Integration and API tests boot a **real Fastify app against a real MongoDB**, on
a database named per test file and dropped afterwards. There are no mocked
repositories: index behaviour, collation and unique constraints are exactly what
is worth testing, and a fake repository reproduces none of them.

Providers are replaced by a programmable `TestAdapter` — not a generic mock — so
a test can express "this model times out while the others succeed" directly.

`TEST_MONGODB_URI` overrides the connection if yours is not on the default port.

## Things that will bite you

- **Type stripping is development-only.** `pnpm backend:dev` uses
  `--experimental-transform-types` for fast iteration. Production builds a real
  artifact with esbuild and runs plain `node dist/server.js` — see
  [ADR-015](../decisions/ADR-015-production-build.md). Verify with
  `pnpm --filter @nexusai/backend build && pnpm --filter @nexusai/backend start:prod`.
- **Env files and PEM keys.** Newlines are stored escaped; `config/env.ts`
  unescapes them. Pasting a raw multi-line PEM into `.env` will not parse.
- **The access token is 15 minutes.** If `/api/auth/me` starts returning
  `TOKEN_EXPIRED`, that is correct — the client refreshes and replays once.

## Verifying providers

Two checks, neither of which is part of `pnpm verify` because both make real
network requests:

```bash
PROVIDER_LIVE=1 pnpm --filter @nexusai/backend vitest run tests/manual/provider-live.test.ts
```

With **no keys** it verifies every provider is reachable and that a rejected
credential is classified as `AUTH_ERROR` — useful on its own, and the check that
caught Google reporting a bad key as HTTP 400 rather than 401.

With **keys present** it additionally asks each configured provider a trivial
question and requires non-empty text back. This is the check that closes the
last unverified gap in [readiness.md](readiness.md).

The adapters' wire handling — request shaping, header placement, response
parsing, SSE reassembly across chunk boundaries — is covered without any network
by `tests/integration/adapter-wire.test.ts`, which runs in the normal suite.

## The synthesis trust boundary

Model responses are third-party text, and the synthesis stage reads them beside
its own instructions. Each untrusted section — every model response *and* the
user's question — is wrapped in a fence carrying a random per-turn label:

```text
<<<BEGIN model-response gpt-4o 9f2ac41b0d7e>>>
…content, byte for byte…
<<<END 9f2ac41b0d7e>>>
```

Content is never escaped or stripped, so a hijack attempt stays visible to the
synthesiser as evidence about that model's output. What it cannot do is end its
own section: the closing marker is unguessable.

If you change `buildSynthesisMessages`, keep the instructions and the content in
one function. They must share a label — a fence the system prompt does not
describe is decorative. `tests/security/prompt-injection.test.ts` enforces this.

## Password policy

Minimum length is **4**, defined once as `PASSWORD_MIN` in
`packages/contracts/src/auth.ts` and consumed by both the backend's request
schema and the registration form's hint and `minLength`. Change it there and
both sides move together; there is no second copy to forget.

It is a policy value and nothing more. Hashing is Argon2id at OWASP parameters
regardless of length, the unknown-email path still burns a verification so it
cannot be timed apart from a wrong password, and no composition rule was added
— `Passw0rd!` satisfies every class requirement and is weaker than a longer
passphrase.

`LoginRequest` uses `min(1)`, deliberately: accounts created under an older rule
must still be able to sign in, and applying the registration minimum at sign-in
would tell an attacker what the rule is.
