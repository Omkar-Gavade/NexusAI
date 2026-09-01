import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const base = read('./base.css');
const appShell = read('../components/layout/app-shell.tsx');
const homePage = read('../pages/home/home-page.tsx');
const authLayout = read('../pages/auth/auth-layout.tsx');

/**
 * The declarations inside a top-level selector's block, comments removed.
 *
 * Stripping comments is not incidental: these rules are heavily commented with
 * the words they are asserting the absence of, and a matcher that reads the
 * prose reports a failure that is not there.
 */
function ruleFor(css: string, selector: string): string {
  const match = new RegExp(`(^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`).exec(css);
  return (match?.[2] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The public pages scroll; the workspace does not.
 *
 * This is asserted against the stylesheet rather than a rendered layout because
 * jsdom performs no layout — it cannot measure a scroll height, so a test that
 * appeared to check scrolling would be checking nothing. What can be verified
 * exactly is the rule that caused the bug.
 *
 * The bug: `html` and `body` were both pinned to `height: 100dvh` with
 * `body { overflow: hidden }`. That is what the chat workspace needs, and every
 * other route inherited it. Because `html` was `overflow: visible`, the body's
 * value propagated to the viewport, so user scrolling — wheel, keyboard,
 * scrollbar — was disabled document-wide, on a marketing page over eight
 * thousand pixels tall.
 */
describe('scroll architecture', () => {
  it('does not pin the document to the viewport', () => {
    const html = ruleFor(base, 'html');
    const body = ruleFor(base, 'body');

    // A fixed height on either leaves the document unable to grow with content.
    expect(html).not.toMatch(/(^|[^-])height:\s*100(dvh|vh|%)/);
    expect(body).not.toMatch(/(^|[^-])height:\s*100(dvh|vh|%)/);
  });

  it('does not clip the document, which would propagate to the viewport', () => {
    const body = ruleFor(base, 'body');
    const html = ruleFor(base, 'html');

    // `html` is `visible`, so whatever `body` declares becomes the viewport's.
    expect(body).not.toMatch(/overflow(-y)?:\s*(hidden|clip)/);
    expect(html).not.toMatch(/overflow(-y)?:\s*(hidden|clip)/);
  });

  it('lets the document grow while still filling a short viewport', () => {
    expect(ruleFor(base, 'body')).toMatch(/min-height:\s*100dvh/);
  });

  it('gives #root no height of its own', () => {
    // A height here is the same constraint one level down.
    expect(ruleFor(base, '#root')).not.toMatch(/(^|[^-])height:/);
  });

  // The workspace genuinely wants a fixed viewport with internal scrolling.
  // It owns that constraint rather than imposing it on the document.
  it('locks the workspace shell, in viewport units rather than a height chain', () => {
    expect(appShell).toMatch(/h-dvh/);
    expect(appShell).toMatch(/overflow-hidden/);
    // `h-full` here would depend on html/body having definite heights — the
    // very chain whose removal fixed the public pages.
    expect(appShell).not.toMatch(/className="flex h-full"/);
  });

  it('sizes the public pages against the viewport, not an ancestor percentage', () => {
    // `min-h-full` resolves to nothing once the ancestor chain has no height.
    for (const page of [homePage, authLayout]) {
      expect(page).toMatch(/min-h-dvh/);
      expect(page).not.toMatch(/min-h-full/);
    }
  });
});
