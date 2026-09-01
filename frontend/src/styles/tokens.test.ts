import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Parses the real token file rather than a copy, so a palette edit that breaks
 * a documented contrast ratio fails the build. This is the mechanism that makes
 * the contrast tables in docs/02-design-language.md a contract and not a claim.
 */
// Resolved from the package root: under jsdom, import.meta.url is not a file URL.
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function themeBlock(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing theme block: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);

  const tokens: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name!] = value!;
  }
  return tokens;
}

const dark = themeBlock("[data-theme='dark']");
const light = themeBlock("[data-theme='light']");

function channel(component: number): number {
  const c = component / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(value.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function ratio(theme: Record<string, string>, fg: string, bg: string): number {
  const foreground = theme[fg];
  const background = theme[bg];
  expect(foreground, `token ${fg} is missing`).toBeDefined();
  expect(background, `token ${bg} is missing`).toBeDefined();
  return contrast(foreground!, background!);
}

/** Every surface a given foreground can legitimately sit on. */
const SURFACES = [
  '--surface-canvas',
  '--surface-workspace',
  '--surface-raised',
  '--surface-floating',
  '--surface-hover',
];

const BODY_TEXT = ['--text-primary', '--text-secondary', '--text-tertiary'];
const SIGNALS = ['--accent', '--status-success', '--status-warning', '--status-danger'];

describe.each([
  ['dark', dark],
  ['light', light],
])('%s theme contrast', (name, theme) => {
  it('parses a complete palette', () => {
    expect(Object.keys(theme).length, `${name} palette looks truncated`).toBeGreaterThan(20);
  });

  it.each(BODY_TEXT)('%s meets WCAG AA (4.5:1) on every surface', (token) => {
    for (const surface of SURFACES) {
      expect(ratio(theme, token, surface), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(SIGNALS)('%s meets WCAG AA (4.5:1) on every surface', (token) => {
    for (const surface of SURFACES) {
      expect(ratio(theme, token, surface), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // WCAG 1.4.11: a control identifiable only by its outline needs 3:1.
  it('--border-control meets 3:1 on the surfaces controls sit on', () => {
    for (const surface of ['--surface-canvas', '--surface-workspace', '--surface-raised']) {
      expect(ratio(theme, '--border-control', surface), `on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  // The focus ring is a non-text indicator; 3:1 is the requirement, and the
  // design claims a far larger margin than that.
  it('--accent works as a focus ring against every surface', () => {
    for (const surface of SURFACES) {
      expect(ratio(theme, '--accent', surface), `focus on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  // 1.4.3 exempts inactive controls, but keeping disabled text above 3:1 is a
  // usability decision beyond the requirement — assert it so it is not lost.
  it('--text-disabled stays legible at 3:1 on the canvas', () => {
    expect(ratio(theme, '--text-disabled', '--surface-canvas')).toBeGreaterThanOrEqual(3);
  });

  it('the primary button reaches AAA in both directions', () => {
    expect(ratio(theme, '--text-inverse', '--text-primary')).toBeGreaterThanOrEqual(7);
  });

  it('keeps surface steps subtle so the UI is not a stack of grey cards', () => {
    const steps: Array<[string, string]> = [
      ['--surface-canvas', '--surface-workspace'],
      ['--surface-workspace', '--surface-raised'],
      ['--surface-raised', '--surface-floating'],
    ];
    for (const [a, b] of steps) {
      const step = ratio(theme, a, b);
      expect(step, `${a} → ${b} should differ at all`).toBeGreaterThan(1);
      expect(step, `${a} → ${b} is too loud`).toBeLessThan(1.35);
    }
  });
});

describe('theme parity', () => {
  it('defines the same token names in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('is not an inversion — light chrome is darker than its canvas, dark chrome is lighter', () => {
    expect(luminance(dark['--surface-workspace']!)).toBeGreaterThan(
      luminance(dark['--surface-canvas']!),
    );
    expect(luminance(light['--surface-workspace']!)).toBeLessThan(
      luminance(light['--surface-canvas']!),
    );
  });

  it('keeps the accent clear of the status hues it sits beside', () => {
    // Verdigris must not be confusable with success green in either theme.
    for (const theme of [dark, light]) {
      expect(contrast(theme['--accent']!, theme['--status-success']!)).not.toBe(1);
    }
  });
});

describe('token system integrity', () => {
  it('maps every semantic colour into the Tailwind theme', () => {
    const themeBlockStart = css.indexOf('@theme inline');
    const mapped = css.slice(themeBlockStart);
    for (const token of [...BODY_TEXT, ...SIGNALS, ...SURFACES, '--border-control']) {
      expect(mapped, `${token} is defined but never exposed as a utility`).toContain(
        `var(${token})`,
      );
    }
  });

  it('caps the radius scale at 8px so nothing reads as a soft AI card', () => {
    const radii = [...css.matchAll(/--radius-[\w-]+:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(radii.length).toBeGreaterThan(0);
    expect(Math.max(...radii)).toBeLessThanOrEqual(8);
  });

  it('keeps every motion duration inside the 100-220ms band', () => {
    const durations = [...css.matchAll(/--duration-[\w-]+:\s*(\d+)ms/g)].map((m) => Number(m[1]));
    expect(durations.length).toBeGreaterThan(0);
    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThanOrEqual(220);
    }
  });
});
