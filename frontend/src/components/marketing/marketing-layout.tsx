import type { ReactNode } from 'react';
import { MarketingFooter } from './marketing-footer';
import { MarketingNav } from './marketing-nav';

/**
 * Shared chrome for every public page.
 *
 * Exists so the five marketing routes cannot drift apart: one nav, one footer,
 * one page frame. Each page supplies only its own sections.
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

/**
 * The opening block of a sub-page: eyebrow, title, standfirst.
 *
 * Deliberately smaller than the homepage hero. A reader who has clicked
 * through has already been sold the idea and wants the detail; repeating a
 * full-height hero on every page is how a marketing site starts to feel like
 * a brochure.
 */
export function PageHero({
  label,
  title,
  lede,
  children,
}: {
  label: string;
  title: string;
  lede: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-line-subtle bg-canvas">
      <div className="mx-auto w-full max-w-[1080px] px-(--gutter) max-lg:px-5">
        <div className="py-16 md:py-20">
          <span data-register="machine" className="text-note uppercase text-ink-3">
            {label}
          </span>
          <h1 className="mt-5 max-w-[20ch] text-section font-[550] text-ink md:text-display">
            {title}
          </h1>
          <p className="mt-5 max-w-[64ch] text-body text-ink-2">{lede}</p>
          {children && <div className="mt-10">{children}</div>}
        </div>
      </div>
    </section>
  );
}
