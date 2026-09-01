import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Text selection must be #ff9933 in both themes.
 *
 * This suite exists because of a real regression, not as a formality. The
 * orange rule was added to `base.css` while an older `::selection` rule using
 * a theme-dependent token still sat further down the same file. Both shipped.
 * At equal specificity the later rule wins, so selection was never orange —
 * and nothing failed, because every check at the time only asked whether a
 * rule containing #ff9933 existed. It did. It just lost.
 *
 * So the assertions below are about the *winning* declaration and about
 * uniqueness, not about presence.
 */

// Resolved from the package root, matching `tokens.test.ts`: under jsdom
// `import.meta.url` does not resolve to a file URL, so the URL-relative form
// yields an http: path that cannot be read from disk.
const SRC = resolve(process.cwd(), 'src');
const STYLES = join(SRC, 'styles');

/** Every stylesheet in the design system, so a competing rule cannot hide in
 *  a file this test forgot to look at. */
const SHEETS = readdirSync(STYLES)
  .filter((name) => name.endsWith('.css'))
  .map((name) => ({ name, css: readFileSync(join(STYLES, name), 'utf8') }));

/**
 * Comments are stripped before anything is matched. The selection block is
 * deliberately commented with the words it is asserting — including the
 * literal text "::selection" and the colour white — and a matcher that reads
 * prose reports failures that are not in the CSS.
 */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every top-level rule whose selector list mentions a selection pseudo. */
function selectionRules(css: string): Array<{ selector: string; body: string }> {
  const rules: Array<{ selector: string; body: string }> = [];
  const pattern = /([^{}]*::(?:-moz-)?selection[^{}]*)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(strip(css))) !== null) {
    rules.push({ selector: match[1]!.trim(), body: match[2]!.trim() });
  }
  return rules;
}

const allRules = SHEETS.flatMap(({ name, css }) =>
  selectionRules(css).map((rule) => ({ ...rule, file: name })),
);

const declarations = (body: string) =>
  Object.fromEntries(
    body
      .split(';')
      .map((part) => part.split(':').map((s) => s.trim()))
      .filter((pair) => pair.length === 2 && pair[0])
      .map(([prop, value]) => [prop!.toLowerCase(), value!.toLowerCase()]),
  ) as Record<string, string>;

// --- WCAG contrast, computed rather than assumed ---------------------------

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex: string): number {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.toLowerCase();
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(full.slice(i, i + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const ORANGE = '#ff9933';

describe('text selection', () => {
  it('defines exactly one ::selection rule and one ::-moz-selection rule', () => {
    // The duplicate that caused the regression would fail here, and would fail
    // here even though it also contained a valid orange rule elsewhere.
    const standard = allRules.filter((r) => /(^|[^-])::selection/.test(r.selector));
    const moz = allRules.filter((r) => r.selector.includes('::-moz-selection'));

    expect(standard.map((r) => `${r.file}: ${r.selector}`)).toHaveLength(1);
    expect(moz.map((r) => `${r.file}: ${r.selector}`)).toHaveLength(1);
  });

  it('keeps the two pseudo-elements in separate rules', () => {
    // Grouped into one selector list, an engine that does not recognise one
    // pseudo-element discards the entire list — and selection styling is lost
    // in exactly the browser the prefixed form was written for.
    for (const rule of allRules) {
      const mentionsBoth =
        /(^|[^-])::selection/.test(rule.selector) && rule.selector.includes('::-moz-selection');
      expect(mentionsBoth).toBe(false);
    }
  });

  it('uses exactly #ff9933 as the selection background', () => {
    expect(allRules).not.toHaveLength(0);

    for (const rule of allRules) {
      const decl = declarations(rule.body);
      const background = decl['background-color'] ?? decl['background'];
      expect(background, `${rule.file} → ${rule.selector}`).toBe(ORANGE);
    }
  });

  it('reads identically in light and dark themes', () => {
    // A token would resolve differently under [data-theme='light'] and
    // [data-theme='dark']; a literal cannot. This is what makes one rule
    // enough to satisfy both themes.
    for (const rule of allRules) {
      expect(rule.body).not.toMatch(/var\(/);
      expect(rule.selector).not.toMatch(/data-theme|prefers-color-scheme/);
    }

    // And no theme block may introduce a selection rule of its own.
    for (const { name, css } of SHEETS) {
      const themed = /(\[data-theme[^{]*|@media[^{]*prefers-color-scheme[^{]*)\{[\s\S]*?::(?:-moz-)?selection/;
      expect(themed.test(strip(css)), name).toBe(false);
    }
  });

  it('uses no gradient for the selection background', () => {
    for (const rule of allRules) {
      expect(rule.body).not.toMatch(/gradient/i);
    }
  });

  it('picks a foreground that is actually readable on #ff9933', () => {
    for (const rule of allRules) {
      const foreground = declarations(rule.body)['color'];
      expect(foreground, `${rule.file} → ${rule.selector}`).toMatch(/^#[0-9a-f]{3,6}$/);

      // White is the obvious guess and it fails: 2.13:1 against this orange.
      expect(contrast(ORANGE, foreground!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('confirms white would have failed', () => {
    // Pins the reason the foreground is near-black, so a future edit to white
    // cannot be justified as an oversight.
    expect(contrast(ORANGE, '#ffffff')).toBeLessThan(3);
    expect(contrast(ORANGE, '#1a1200')).toBeGreaterThan(7);
  });
});

describe('no competing selection styling outside the stylesheets', () => {
  it('has no Tailwind selection: variant in any component', () => {
    // `selection:bg-*` on any element would override the global rule for that
    // subtree, which is the same silent-override failure in another syntax.
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(tsx?|css|html)$/.test(entry.name) && !entry.name.includes('selection.test')) {
          if (/selection:(bg|text)-/.test(readFileSync(path, 'utf8'))) offenders.push(path);
        }
      }
    };
    walk(SRC);

    expect(offenders).toEqual([]);
  });
});
