import type { ReactNode } from 'react';
import { MarketingFooter } from './marketing-footer';
import { MarketingNav } from './marketing-nav';

/**
 * Shared chrome for every public page.
 *
 * There is one public page now, so this wraps exactly one caller. It stays a
 * component rather than being folded into the homepage because the nav and
 * footer are page chrome, not page content: the homepage file should read as
 * the argument it makes, not as a header followed by an argument followed by a
 * footer.
 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <MarketingNav />
      <main id="main">{children}</main>
      <MarketingFooter />
    </div>
  );
}
