# ADR-015 — Production build: esbuild bundle, no experimental runtime

Status: **Accepted** · 2026-08-28

## Context

The backend ran under `node --experimental-transform-types`, needed because the
code uses TypeScript constructor parameter properties, which require
transformation rather than type erasure. `pnpm build` was `tsc --noEmit` — it
produced **no artifact at all**. There was nothing deployable.

Two obstacles to emitting JavaScript:

1. Source files import with explicit `.ts` extensions, required by
   `allowImportingTsExtensions`, which in turn requires `noEmit`.
2. `@nexusai/contracts` resolves to `src/index.ts`. It ships TypeScript sources,
   and the **frozen frontend depends on that resolution** through Vite.

## Decision

**Bundle the backend with esbuild. Keep runtime dependencies external.**

```text
src/server/main.ts  +  @nexusai/contracts (bundled)
        ↓ esbuild — ESM, node22, sourcemaps
dist/server.js      +  node_modules (external, normal resolution)
        ↓
node dist/server.js
```

`pnpm build` runs `tsc --noEmit` first — esbuild strips types, it does not check
them, so the type gate stays a separate, explicit step.

## Alternatives considered

- **`tsc --outDir` with `rewriteRelativeImportExtensions`** (TS 5.7+). Would work
  for the backend, but `@nexusai/contracts` would also need emitting, and its
  `main` would move to `dist/`. The frontend's build *and test run* would then
  depend on contracts being compiled first — a real regression imposed on frozen
  code to serve a backend concern.
- **Bundling dependencies too.** Rewrites `@node-rs/argon2`, a native module,
  and inflates the artifact for no gain when `node_modules` ships anyway.
- **Keeping the experimental flag.** Rejected outright: an experimental runtime
  flag is not a production posture.

## Consequences

- `node dist/server.js` starts with **no experimental flags and no warnings** —
  verified, not assumed.
- The artifact is ~300 KB with 9 external dependencies. `dist/package.json`
  declares `{"type":"module"}` so the bundle stays ESM if copied elsewhere.
- A `createRequire` banner is injected, because bundled CJS dependencies
  occasionally reach for `require` under ESM.
- Development still uses `--experimental-transform-types --watch` for fast
  iteration. **Production never does.** Tests run TypeScript directly through
  Vitest, unchanged.
- Contracts remains a single TypeScript source of truth consumed two ways:
  bundled into the backend artifact, resolved from source by Vite.

## What building it revealed

Exercising the compiled artifact — which is why §64 insists on it — surfaced two
defects that development mode never hit:

1. A bodyless `POST` carrying `Content-Type: application/json` made Fastify raise
   a 400, which the error handler mapped to **`INTERNAL` 500**, breaking logout
   entirely. Framework 4xx errors now map to a validation error, and bodyless
   JSON posts are accepted.
2. Concurrent duplicate sends raced the read-then-write idempotency check. The
   unique index caught the second insert, but an unmapped `E11000` surfaced as a
   500 and an orphan conversation was left behind. The user message is now
   written **before** the conversation row, making the unique index the real
   barrier, and `E11000` maps to `DUPLICATE_REQUEST`.

Both have regression tests.
