# NexusAI

**Several models. One answer you can check.**

NexusAI asks several models the same question, reconciles their responses into a single answer, and
shows you which models agreed and which did not.

## Status

| | |
|---|---|
| Frontend | **FROZEN** — reference implementation for backend integration |
| Backend | **Implemented** — Fastify · MongoDB · compiled artifact · no provider keys configured |
| Contracts | v2.0 — synthesis + provenance stream protocol |
| Verify | `typecheck` · `lint` · **439 tests** · `build` + CSS gate — all green |
| Updated | 2026-08-28 |

**Real providers execute.** Google, Mistral and Groq have each generated real text against their live
endpoints, and a full multi-model turn — fan-out, synthesis, streaming, persistence, provenance — has
run end to end through the compiled production artifact.

Two things that are not true yet. The provider accounts are free-tier and not reliably healthy at the
same time, so a turn can legitimately end up answered by one model (and says so). And **nothing has
been deployed** — every run has been local, which is why the release status is staging, not
production.

Nothing is mocked and no response is fabricated — that is the product's first rule, and it applies to
the development state as much as to production. The backend was built **against
`packages/contracts`**, not by adjusting the frozen frontend to fit.

## Repository

```text
nexusai/
├── frontend/           React 19 · Vite 6 · Tailwind v4 · TanStack Query
├── backend/            Node 22 · Fastify 5 · MongoDB 8 · modular monolith
├── packages/contracts/ Zod schemas + inferred types, shared by both
└── docs/               Specification, by audience
```

See [ADR-009](docs/decisions/ADR-009-repository-structure.md).

## Getting started

```bash
pnpm install
```

```bash
pnpm dev
```

Then open http://localhost:5173. Without a backend you can reach `/`, `/login`, `/register` and the
404 route; `/app` redirects to sign-in.

| Command | Does |
|---|---|
| `pnpm dev` | Vite dev server on 5173, `/api` proxied to `:8080` |
| `pnpm backend:dev` | API on 8080 |
| `pnpm backend:keys` | Generate a JWT keypair for `.env` |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm lint` | ESLint 9 flat config |
| `pnpm test` | Vitest — 439 tests across frontend and backend |
| `pnpm build` | Production build **+ built-CSS validation** |
| `pnpm verify` | All four, in order |

## Routes

| Path | Access | |
|---|---|---|
| `/` | public | Landing — redirects to `/app` when signed in |
| `/login` `/register` | public | Honours `?next=` |
| `/app` | private | Workspace root is a new conversation |
| `/app/chat/:id` | private | Conversation |

Full information architecture: [docs/product/routes.md](docs/product/routes.md).

## Documentation

| Area | Document | Status |
|---|---|---|
| Product | [Overview](docs/product/overview.md) | ✅ current (v2.0) |
| | [Capability matrix](docs/product/capability-matrix.md) | ✅ current — what exists vs what is specified |
| | [Routes & IA](docs/product/routes.md) | ✅ current |
| | [Roadmap](docs/product/roadmap.md) | 🕰 legacy — v1.0 phase plan |
| | [v1 product (historical)](docs/product/legacy/v1-single-model-product.md) | 🕰 legacy |
| Design | [Language](docs/design/language.md) | ✅ current |
| | [Components](docs/design/components.md) | ✅ current |
| Frontend | [Architecture](docs/frontend/architecture.md) | ✅ current |
| Backend | [Development](docs/backend/development.md) | ✅ current — setup and running |
| | [Deployment](docs/backend/deployment.md) | ◐ partial — full guide; artifact runs locally, not deployed |
| | [**Release checklist**](docs/backend/release-checklist.md) | ✅ current — operational pre/post-release steps |
| | [AI quality](docs/backend/ai-quality.md) | ⛔ blocked — methodology ready, needs credentials |
| | [**Readiness matrix**](docs/backend/readiness.md) | ✅ current — PASS / PARTIAL / BLOCKED per area |
| | [Architecture](docs/backend/architecture.md) | 🕰 legacy — v1.0 design, superseded by the implementation |
| | [AI platform](docs/backend/ai-platform.md) | 🕰 legacy — single-model routing |
| API | [Contracts](docs/api/contracts.md) | 🕰 legacy — superseded by `packages/contracts` |
| Architecture | [**Backend handoff**](docs/architecture/backend-handoff.md) | ✅ current — what the backend must implement |
| | [Security & operations](docs/architecture/security-operations.md) | ✅ current |
| | [Quality](docs/architecture/quality.md) | ◐ partial — frontend current, backend chapters planned |
| Decisions | [Risks & ADR index](docs/decisions/README.md) · [009](docs/decisions/ADR-009-repository-structure.md) · [010](docs/decisions/ADR-010-public-product-surface.md) · [011](docs/decisions/ADR-011-tailwind-token-syntax.md) · [012](docs/decisions/ADR-012-comparison-stays-inline.md) · [013](docs/decisions/ADR-013-backend-stack-and-no-redis.md) · [014](docs/decisions/ADR-014-synthesis-and-stance.md) · [015](docs/decisions/ADR-015-production-build.md) · [016](docs/decisions/ADR-016-provider-health-and-verification.md) · [017](docs/decisions/ADR-017-synthesis-trust-boundary.md) · [018](docs/decisions/ADR-018-sources-remain-planned.md) | ✅ current |

Every document carries a status banner: **current**, **legacy** (kept for its still-valid reasoning,
superseded on scope), or **planned** (a design, not a description).

**`packages/contracts` is the authoritative API specification.** A defined contract is not an
implemented endpoint — [docs/product/capability-matrix.md](docs/product/capability-matrix.md) states
which each one is.

## The seven rules

1. **Real AI.** Nothing simulated — not responses, latency, model names, availability, agreement
   counts, or sources.
2. **Multi-model from day one.** The provider abstraction is foundational, not retrofitted.
3. **Auto never selects Mock.**
4. **User isolation.** Authorization derives only from the authenticated session.
5. **Provider secrets never reach the browser.**
6. **Honest UI.** Every displayed value was measured. No invented confidence percentages, no
   fabricated agreement counts, no citation without a real source.
7. **Model output is untrusted input.** Responses from other vendors are fenced with a per-turn
   random label before the synthesis stage sees them, so no model response can close its section
   and issue instructions ([ADR-017](docs/decisions/ADR-017-synthesis-trust-boundary.md)).

Rule 6 extends to the landing page: no usage statistics, no customer counts, no compliance badges,
no vendor names, and the hero illustration is captioned as a static illustration. Capabilities are
labelled **Interface built** or **Planned** — never "available" — and the section states the
pre-launch position outright. Assertions in `home-page.test.tsx` fail the build if any of that
changes.

## Design identity

Warm graphite surfaces with a single cool verdigris accent, inverting the cool-grey-plus-warm-accent
convention shared by most AI products. Two typefaces in two semantic registers — Instrument Sans for
anything a human or model wrote, IBM Plex Mono for anything the system measured — so metadata can
never be mistaken for content. Radius encodes interactivity: structure is square, controls are
rounded, nothing exceeds 8px. Dividers span the reading measure rather than the viewport and carry
their labels inline. A 2px segmented Provenance Rail encodes which models contributed and where they
disagreed, using position and density rather than vendor colour.
