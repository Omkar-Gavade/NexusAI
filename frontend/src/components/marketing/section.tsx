import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Rule } from '@/components/ui/rule';
import { Reveal } from './reveal';

/**
 * Marketing layout primitive.
 *
 * Marketing and product share every token but not their density: the workspace
 * is dense because it holds work, and these pages are spacious because they
 * hold an argument. The measure is wider here than the answer column for the
 * same reason — nobody is reading this for eight hours.
 */
export function Section({
  id,
  label,
  title,
  lede,
  children,
  surface = 'canvas',
  layout = 'stacked',
  className,
}: {
  id?: string;
  label?: string;
  title?: string;
  lede?: string;
  children?: ReactNode;
  /**
   * Which field the band sits on. Alternating them is what stops a long page
   * reading as one undifferentiated document: the eye needs a boundary to know
   * a new idea has started, and a hairline rule alone does not provide one.
   */
  surface?: 'canvas' | 'raised';
  /**
   * `split` puts the heading in a sticky left column beside the content.
   *
   * Used where the content is a sequence the reader works through — the
   * heading stays in view as context rather than scrolling away, and the page
   * gains a second layout so twelve sections do not all present as one shape.
   */
  layout?: 'stacked' | 'split';
  className?: string;
}) {
  return (
    <section
      id={id}
      className={clsx(
        'scroll-mt-16 border-t border-line-subtle',
        surface === 'raised' ? 'bg-workspace' : 'bg-canvas',
        className,
      )}
    >
      <MarketingContainer>
        <div
          className={clsx(
            'py-16 md:py-24',
            layout === 'split' &&
              'md:grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-16',
          )}
        >
          <Reveal className={clsx(layout === 'split' && 'md:sticky md:top-24 md:self-start')}>
            {label && <Rule label={label} className="mb-8" />}

            {title && (
              <h2 className="max-w-[24ch] text-section font-[550] text-ink md:text-display">
                {title}
              </h2>
            )}

            {lede && (
              <p
                className={clsx(
                  'mt-4 text-body text-ink-2',
                  layout === 'split' ? 'max-w-[46ch]' : 'max-w-[62ch]',
                )}
              >
                {lede}
              </p>
            )}
          </Reveal>

          {children && (
            // A step behind the heading, so the eye reads the claim before the
            // diagram that supports it.
            <Reveal
              delay={90}
              className={clsx(layout === 'split' ? 'max-md:mt-12' : (title || lede) && 'mt-12')}
            >
              {children}
            </Reveal>
          )}
        </div>
      </MarketingContainer>
    </section>
  );
}

/** The shared horizontal frame. Wider than the answer measure, still bounded. */
export function MarketingContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1080px] px-(--gutter) max-lg:px-5">{children}</div>
  );
}
