# Capability Matrix

Status: **CURRENT** · Updated 2026-08-28 · Derived from the repository, not from intent.

The single source of truth for what exists. Anything not listed here does not
exist.

## The six states

A capability is not binary. Conflating these is how a project comes to believe
it has shipped something it has only drawn.

| State | Means |
|---|---|
| **Designed** | Specified in `docs/design/*` — a decision exists |
| **Frontend implemented** | The interface is built and reachable in the running app |
| **Contract defined** | Typed in `packages/contracts`, so client and server cannot disagree |
| **Client wired** | The client actually issues the request |
| **Backend implemented** | A server answers it |
| **E2E verified** | Exercised end to end through the running stack |

> **Real model providers are configured and have executed.** Google, Mistral and
> Groq have each generated real text against their live endpoints, and a full
> multi-model turn — fan-out, synthesis, streaming, persistence, provenance —
> has run end to end through the compiled production artifact.
>
> Two caveats that matter more than the headline. The accounts are free-tier and
> **not reliably healthy at the same time**: a recent turn had one model
> throttled and another unpayable, so the answer came from a single model and
> said so. And **nothing has been deployed** — every run has been local.
>
> Superseded text follows for the rows that have not changed:
>
> **The backend is implemented and running.**
> All eleven wired endpoints are served by Fastify against MongoDB. Every
> end-to-end journey was verified against the **deterministic test adapter**,
> through the **compiled production artifact** — no API key exists in this
> environment, so **no model has generated a token for this system**, and that is
> not claimed anywhere.
>
> The HTTP adapters are separately verified against a local server speaking each
> provider's wire format, and all six providers were reached at their live
> endpoints to confirm a rejected key is classified correctly. The single
> remaining gap is a successful generation. Per-area status:
> [backend/readiness.md](../backend/readiness.md).

## Matrix

`D` designed · `F` frontend · `C` contract · `W` wired · `B` backend · `E` e2e

`E` reads `test` where the journey was verified through the running stack using
the deterministic adapter, and `real` where it has been exercised against live
model providers.

| Capability | D | F | C | W | B | E | Homepage says |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Multi-model orchestration | ✓ | ✓ | ✓ | ✓ | ✓ | real | Interface built |
| Synthesis | ✓ | ✓ | ✓ | ✓ | ✓ | real | Interface built |
| Provenance rail | ✓ | ✓ | ✓ | ✓ | ✓ | real | Interface built |
| Model comparison | ✓ | ✓ | ✓ | ✓ | ✓ | test | Interface built |
| Sources list | ✓ | ✓ | ✓ | ✓ | ✓ *always empty* | — | Interface built |
| Inline citations | ✓ | — | partial | — | — | — | Planned |
| Conversation history | ✓ | ✓ | ✓ | ✓ | ✓ | real | Interface built |
| Rename / delete conversation | ✓ | ✓ | ✓ | ✓ | ✓ | test | Interface built |
| Authentication | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | *not listed* |
| Light / dark themes | ✓ | ✓ | n/a | n/a | n/a | ✓ | Interface built |
| Conversation search | ✓ | ✓ *local* | — | — | n/a | ✓ *local* | *not listed* |
| Settings — appearance | ✓ | ✓ | n/a | n/a | n/a | ✓ | *not listed* |
| Settings — profile write | ✓ | — | ✓ | — | ✓ | — | *not listed* |
| Regenerate | ✓ | ✓ *replays prompt* | — | — | — | — | *not listed* |
| Message pagination | ✓ | — | ✓ | — | ✓ | — | *not listed* |
| Attachments | ✓ | tray only | — | — | — | — | Planned |
| Projects | ✓ | — | ✓ | — | — | — | Planned |
| Knowledge | ✓ | — | — | — | — | — | Planned |
| Desktop side panel | ✗ *rejected* | — | n/a | — | — | — | *not listed* |
| Mobile comparison tabs | ✗ *rejected* | — | n/a | — | — | — | *not listed* |

The two rejected rows are closed decisions, not backlog:
[ADR-012](../decisions/ADR-012-comparison-stays-inline.md).

Themes, appearance settings and local search are fully verified because they
never touch a server. Authentication is fully verified because it involves no
model provider. Everything marked `test` is verified through the real stack but
with a deterministic adapter standing in for the model.

## Endpoints

**Wired — the client issues these:**

```text
POST   /api/auth/register            GET    /api/models
POST   /api/auth/login               GET    /api/conversations
POST   /api/auth/logout              PATCH  /api/conversations/:id
POST   /api/auth/refresh             DELETE /api/conversations/:id
GET    /api/auth/me                  GET    /api/conversations/:id/messages
POST   /api/chat/stream
```

**Contract defined, not wired:** `PATCH /api/auth/me`, `GET /api/projects`.
**Neither:** attachment upload, `POST /api/chat/regenerate`.

**Implemented by a server: all eleven.** Contract and implementation notes:
[backend-handoff.md](../architecture/backend-handoff.md).

**Sources are always empty, by decision rather than by omission.** The contract
describes a retrieved document — `url`, `domain`, `snippet`, `retrievedAt` — and
nothing in this system retrieves anything: every adapter sends a plain
chat-completions request with no search or grounding tool. The three ways to
fill that shape are provider grounding (a feature, not yet built), our own
retrieval (out of scope), or scraping URLs out of a model's prose (refused
permanently — nobody fetched them, so the snippet and timestamp would be
invented). Reasoning in [ADR-018](../decisions/ADR-018-sources-remain-planned.md);
guarded by `tests/integration/sources.test.ts`.

**Real-provider generation: never performed.** No API key is configured in this
environment, so every verified journey used the deterministic adapter. The
adapter returns clearly-labelled placeholder text and is refused in production —
config exits rather than warns, and the registry filters test-only models out of
the catalog entirely.

Reaching the providers *is* verified: `tests/manual/provider-live.test.ts`
(opt-in, `PROVIDER_LIVE=1`) confirms all six reject an invalid key with
`AUTH_ERROR`, and runs a real generation per provider the moment a key exists.

## Marketing rules

The landing page may say a capability's **interface is built**, because it is,
and may describe what the product is designed to do. It may **not**:

- describe any capability as available, live, or generally available
- imply a request currently reaches a model
- claim uptime, accuracy, latency, user, customer or request figures
- display a compliance badge or a customer logo
- name a model vendor
- show an interface illustration without captioning it as one
- describe `Planned` work in the present tense

The capabilities section states the pre-launch position in the lede rather than
leaving it to be inferred from a status column.

Enforced by assertions in `frontend/src/pages/home/home-page.test.tsx`, which
fail the build rather than relying on review.

## Search wording

Search filters the conversation list already in the client's cache, by title
only. It does not query a server and does not search message bodies. The dialog
says so. It must never be described as global or full-text search.
