import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The composer must clear the iOS home indicator.
 *
 * `viewport-fit=cover` is set on the viewport meta, which means the browser
 * will draw under the notch and the home indicator. A fixed bottom padding
 * therefore puts the send button underneath the indicator on every notched
 * iPhone — invisible in jsdom, invisible in a desktop browser, and reported by
 * users. Asserted against the source because there is no layout engine here
 * that would reveal it.
 */
const composer = readFileSync(
  resolve(process.cwd(), 'src/features/chat/components/composer.tsx'),
  'utf8',
);
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('composer safe area', () => {
  it('pads the bottom by at least the safe-area inset', () => {
    expect(composer).toMatch(/env\(safe-area-inset-bottom\)/);
    // `max()` so the padding never collapses below the design value on a
    // device that reports a zero inset.
    expect(composer).toMatch(/max\([^)]*env\(safe-area-inset-bottom\)\)/);
  });

  it('opts into the display cutout, which is what makes the inset non-zero', () => {
    expect(html).toMatch(/viewport-fit=cover/);
  });
});
