#!/usr/bin/env node
/**
 * Production build.
 *
 * Bundles the server and the workspace contract package into one ESM file and
 * leaves runtime dependencies external, so node_modules resolution is normal
 * and native modules (argon2) are never rewritten.
 *
 * esbuild rather than `tsc --outDir`: the contract package resolves to
 * `src/index.ts`, and the frozen frontend depends on that resolution through
 * Vite. Emitting contracts to dist/ would make the frontend's build and tests
 * depend on it being compiled first — a regression in frozen code. Bundling the
 * workspace package here keeps that resolution untouched.
 *
 * Type checking is a separate step: esbuild strips types, it does not check
 * them. `pnpm build` runs both.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// Everything installed stays external. The workspace contract package is the
// one bare specifier that must be bundled — it ships TypeScript sources.
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => d !== '@nexusai/contracts');

rmSync('dist', { recursive: true, force: true });

const result = await build({
  entryPoints: ['src/server/main.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  minify: false, // Readable stack traces matter more than bytes on a server.
  external,
  logLevel: 'warning',
  metafile: true,
  banner: {
    // Bundled CJS dependencies occasionally reach for these under ESM.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});

// A minimal package.json beside the bundle so Node treats it as ESM even if the
// artifact is copied somewhere without the workspace manifest.
writeFileSync('dist/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n');

const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log(`  built dist/server.js — ${(bytes / 1024).toFixed(1)} KB, ${external.length} external deps`);
