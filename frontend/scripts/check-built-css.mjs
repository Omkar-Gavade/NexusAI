#!/usr/bin/env node
/**
 * Validates the emitted stylesheet.
 *
 * ADR-011 records a regression where every token-backed utility compiled to
 * invalid CSS — `max-width: --measure-answer` instead of
 * `max-width: var(--measure-answer)`. Browsers drop invalid declarations
 * silently, so the reading measure, every transition duration and every
 * z-index were inert while typecheck, lint, tests and the build all passed.
 *
 * Nothing in a JS toolchain looks at whether a CSS declaration survives
 * parsing. This does, against the real build output, using a real parser
 * rather than a regex over raw text.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

const ASSETS = 'dist/assets';

/** Utilities whose failure would be invisible but structurally serious. */
const REQUIRED = [
  ['max-width', '--measure-answer', 'the conversation reading measure'],
  ['padding-inline', '--gutter', 'page gutters'],
  ['height', '--header-height', 'the workspace header'],
  ['z-index', '--z-dropdown', 'overlay layering'],
  ['background-color', '--scrim', 'the drawer scrim'],
];

function findStylesheet() {
  let files;
  try {
    files = readdirSync(ASSETS).filter((f) => f.endsWith('.css'));
  } catch {
    fail(`No ${ASSETS} directory. Run the build first: pnpm build`);
  }
  if (files.length === 0) fail(`No stylesheet in ${ASSETS}. Run: pnpm build`);
  return join(ASSETS, files[0]);
}

function fail(message, details = []) {
  console.error(`\n  CSS validation failed\n\n  ${message}`);
  for (const line of details.slice(0, 20)) console.error(`    ${line}`);
  if (details.length > 20) console.error(`    …and ${details.length - 20} more`);
  console.error('');
  process.exit(1);
}

const path = findStylesheet();
const root = postcss.parse(readFileSync(path, 'utf8'));

const defined = new Set();
const referenced = new Map();
const bareTokenValues = [];

root.walkDecls((decl) => {
  const value = decl.value.trim();

  if (decl.prop.startsWith('--')) {
    defined.add(decl.prop);
    // A custom property may legitimately hold anything, including another
    // token name, so it is never checked for the bare-value defect.
    for (const [, name] of value.matchAll(/var\((--[A-Za-z0-9_-]+)\s*\)/g)) {
      referenced.set(name, decl.prop);
    }
    return;
  }

  // A bare custom-property name is not a valid value for any standard
  // property. This is precisely the ADR-011 defect.
  if (/^--[A-Za-z0-9_-]+$/.test(value)) {
    bareTokenValues.push(`${decl.prop}: ${value}   (in ${decl.parent?.selector ?? '?'})`);
  }

  // Only references without a fallback matter: var(--x, normal) resolves
  // whether or not --x exists.
  for (const [, name] of value.matchAll(/var\((--[A-Za-z0-9_-]+)\s*\)/g)) {
    referenced.set(name, decl.prop);
  }
});

if (bareTokenValues.length > 0) {
  fail(
    `${bareTokenValues.length} declaration(s) use a bare token name as a value.\n` +
      '  Browsers discard these silently. Use the v4 parenthesis form for bare\n' +
      '  custom properties, not the v3 bracket form.\n',
    bareTokenValues,
  );
}

const undefinedRefs = [...referenced]
  .filter(([name]) => !defined.has(name))
  .map(([name, prop]) => `${name}  (referenced by ${prop})`);

if (undefinedRefs.length > 0) {
  fail(
    `${undefinedRefs.length} var() reference(s) point at a token that is never defined.\n` +
      '  A renamed or deleted token leaves the declaration resolving to nothing.\n',
    undefinedRefs,
  );
}

const css = root.toString();
const missing = REQUIRED.filter(([prop, token]) => !css.includes(`${prop}:var(${token})`)).map(
  ([prop, token, why]) => `${prop}:var(${token})  — ${why}`,
);

if (missing.length > 0) {
  fail(
    `${missing.length} critical utility/utilities did not reach the stylesheet.\n` +
      '  Either the class is no longer used, or it compiled to something else.\n',
    missing,
  );
}

console.log(
  `  CSS ok — ${path}\n` +
    `  ${defined.size} tokens defined, ${referenced.size} referenced, ` +
    `${REQUIRED.length} critical utilities present`,
);
