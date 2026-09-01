# ADR-009 — Repository structure: frontend / backend / packages

Status: **Accepted** · 2026-08-19

## Context

The repository used a `apps/web` + `apps/api` layout inherited from the original
specification. Only `apps/web` was ever populated. The `apps/*` grouping added a
directory level that carried no information — with exactly one application and
one future service, "apps" grouped a set of one.

It also made the frontend/backend boundary implicit rather than visible at the
repository root, which is the first thing anyone opening the project reads.

## Decision

Three top-level code directories:

```text
frontend/            React + Vite client
backend/             API service — not yet implemented
packages/contracts/  Zod schemas shared by both
docs/                Specification, organised by audience
```

`backend/` exists with a README documenting the endpoints the frontend consumes
and the intended internal structure. It contains **no stub server and no mock
handlers** — a placeholder that returns fabricated responses would violate the
product's first rule and would let the frontend appear to work when it does not.

## Alternatives considered

- **Keep `apps/*`.** Conventional in Turborepo/Nx setups, but those tools are not
  used here and the grouping earns nothing at this size.
- **Frontend at the repository root.** Would put `src/`, `public/` and
  `index.html` at the top level and force the backend into a subdirectory,
  making the two look asymmetric when they are peers.
- **Separate repositories.** Loses the shared contract package, which is the
  main mechanism preventing client/server drift.

## Consequences

- `pnpm-workspace.yaml` lists `frontend`, `backend`, `packages/*` explicitly.
- `frontend/tsconfig.json` extends `../tsconfig.base.json` (one level, not two).
  Getting this wrong silently disabled `skipLibCheck` and made `tsc` typecheck
  all of `node_modules` — caught during migration.
- Root scripts filter by package name (`@nexusai/frontend`) rather than path.
- All documentation path references were rewritten; 54 cross-links updated.
