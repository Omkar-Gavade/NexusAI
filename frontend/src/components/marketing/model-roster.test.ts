import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROSTER } from './model-roster';

/**
 * The public model list must match the backend catalog.
 *
 * `model-roster.tsx` carries the names as literals, because a marketing page
 * has no session and cannot read `/api/models`. That duplication is only
 * acceptable while it is checked: without this test, a model renamed in the
 * catalog would keep its old name on the public site indefinitely, and the
 * site would be advertising something the product does not have.
 */
// Resolved from the Vitest root (the frontend package) rather than from
// `import.meta.url`, which the transform does not leave as a file: URL.
const catalog = readFileSync(
  resolve(process.cwd(), '../backend/src/domain/models/catalog.ts'),
  'utf8',
);

/** Every non-test entry, as `providerDisplayName` → `displayName`. */
function catalogEntries(): Array<{ provider: string; model: string }> {
  const pattern =
    /providerDisplayName: '([^']+)',\s*\n\s*providerModelId: '[^']+',\s*\n\s*displayName: '([^']+)'/g;
  return [...catalog.matchAll(pattern)]
    .map((m) => ({ provider: m[1]!, model: m[2]! }))
    // The test provider is development-only: the registry filters it out of
    // the catalog entirely unless TEST_PROVIDER_ENABLED, and it must never
    // appear on a public page.
    .filter((entry) => entry.provider !== 'Test');
}

describe('public model roster', () => {
  it('lists exactly the catalog’s real models', () => {
    const expected = catalogEntries();

    // Sanity: the parse found something, so a regex that silently stops
    // matching cannot make this test vacuously pass.
    expect(expected.length).toBeGreaterThanOrEqual(6);
    expect([...ROSTER]).toEqual(expected);
  });

  it('does not advertise the development test models', () => {
    const names = ROSTER.map((entry) => entry.model.toLowerCase());
    expect(names.some((name) => name.includes('test'))).toBe(false);
  });

  it('claims no availability for any provider', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/marketing/model-roster.tsx'),
      'utf8',
    );

    // Availability depends on a deployment's configuration and on the provider
    // itself. A static page cannot know it, so it must not print it.
    expect(source).not.toMatch(/\bavailable now\b|\bonline\b|\bactive\b|\ball providers\b/i);
  });
});

/**
 * The workspace preview prints catalog *ids* (`gpt-4o`), not display names,
 * because that is what a comparison card header shows in the real product.
 * Those ids are equally capable of drifting, so they are checked the same way.
 */
describe('workspace preview', () => {
  const preview = readFileSync(
    resolve(process.cwd(), 'src/components/marketing/product-preview.tsx'),
    'utf8',
  );

  /** Ids of the real (non-test) models, in catalog order. */
  function catalogIds(): string[] {
    const pattern = /id: '([^']+)',\s*\n\s*provider: '([^']+)'/g;
    return [...catalog.matchAll(pattern)]
      .filter((m) => m[2] !== 'test')
      .map((m) => m[1]!);
  }

  it('names only models that exist in the catalog', () => {
    const ids = catalogIds();
    expect(ids.length).toBeGreaterThanOrEqual(6);

    const shown = [...preview.matchAll(/modelId: '([^']+)'/g)].map((m) => m[1]!);
    expect(shown.length).toBeGreaterThan(0);

    for (const id of shown) {
      expect(ids, `${id} is not a catalog model id`).toContain(id);
    }
  });

  it('shows a real answer surface rather than placeholder bars', () => {
    // The preview this replaced was grey `bg-hover` blocks standing in for
    // text. It read as an unfinished wireframe, which is a worse claim about
    // the product than showing nothing. If those come back, so does the bug.
    expect(preview).not.toMatch(/Skeleton/);
    expect(preview).toMatch(/agreementSentence/);
    expect(preview).toMatch(/latency\(/);
  });

  it('presents no capability the matrix marks as planned', () => {
    // Sources and attachments are Planned. The real answer surface renders a
    // SOURCES disclosure when it has any; the preview must not imply one.
    expect(preview).not.toMatch(/\bSOURCES\b|\bSourceList\b|Paperclip/);
  });
});
