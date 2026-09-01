# NexusAI Backend

**Not implemented.** This directory exists so the repository's frontend/backend
separation is explicit, not to hold a placeholder service. No stub server, no
mock handlers, and no fabricated responses live here — the frontend calls real
endpoints and renders honest degraded states until this is built.

The full contract the backend must satisfy — request and response shapes,
streaming event order, cancellation, error envelope, and the things it must not
do — is [docs/architecture/backend-handoff.md](../docs/architecture/backend-handoff.md).

## What the frontend expects

Every endpoint below is consumed by `frontend/src/features/*/api.ts` and typed
by `@nexusai/contracts`. The contract package is the specification.

| Method | Path | Consumed by |
|---|---|---|
| `POST` | `/api/auth/register` | `features/auth` |
| `POST` | `/api/auth/login` | `features/auth` |
| `POST` | `/api/auth/logout` | `features/auth` |
| `POST` | `/api/auth/refresh` | `lib/http.ts` (silent single retry on 401) |
| `GET` | `/api/auth/me` | `features/auth` |
| `PATCH` | `/api/auth/me` | `features/settings` |
| `GET` | `/api/models` | `features/models` |
| `GET` | `/api/conversations` | `features/conversations` |
| `PATCH` | `/api/conversations/:id` | rename |
| `DELETE` | `/api/conversations/:id` | delete |
| `GET` | `/api/conversations/:id/messages` | `features/chat` |
| `POST` | `/api/chat/stream` | `features/chat` — SSE wire format |

Not yet consumed, defined in the contract: `POST /api/chat/regenerate`,
`GET /api/projects`, and any attachment upload endpoint.

## Intended structure

Specified in [docs/backend/architecture.md](../docs/backend/architecture.md).

```text
backend/
├── src/
│   ├── config/          env validation, fail-fast at boot
│   ├── api/             HTTP routes, one module per domain
│   ├── domain/          pure logic — no mongodb, redis, fastify, undici
│   ├── application/     orchestration services
│   ├── infrastructure/  mongodb, redis, providers, observability
│   └── server.ts
└── tests/
```

## Streaming contract

`POST /api/chat/stream` returns `text/event-stream`. The event union is
`ChatEvent` in `packages/contracts/src/chat.ts`. The load-bearing decision:
**per-model text is not streamed.** Models emit `model_start`, then
`model_complete` carrying full text. Only the synthesis streams token by token.
