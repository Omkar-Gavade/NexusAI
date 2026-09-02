import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Reveals a block once it enters the viewport, and once only.
 *
 * Two rules keep this from becoming the scroll-jank that most landing pages
 * ship. It animates `opacity` and `translate` only — both compositor
 * properties, so nothing here triggers layout. And it disconnects after the
 * first intersection: a page of twelve sections should not carry twelve live
 * observers for its whole life.
 *
 * The content is fully present and readable before any of this runs. Motion is
 * applied to something already there, never used to gate whether it exists —
 * which is what keeps the page correct under `prefers-reduced-motion`, with
 * JavaScript disabled, and for a crawler.
 *
 * That was true of the DOM and not of the pixels. `opacity: 0` until an
 * observer says otherwise means any context where the callback never arrives
 * renders a blank page, and there are such contexts: an embedded viewport that
 * is never composited delivers no intersection notification at all, not even
 * for an element filling the screen. So the reveal is also on a timer. Whether
 * the observer fires or not, the content is visible shortly after mount — the
 * observer only decides whether it arrives with motion or simply appears.
 */

/**
 * How long to wait for the observer before showing the content anyway.
 *
 * Long enough that a scrolled-to block still animates rather than being beaten
 * to it by the timer, short enough that a reader never sees the gap.
 */
const FALLBACK_MS = 1200;
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Milliseconds. Used to stagger siblings, never beyond a couple of steps. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Anything that makes the reveal impossible shows the content instead of
    // hiding it. `IntersectionObserver` is absent in jsdom and in older
    // browsers, and `matchMedia` is not universal either — in every one of
    // those cases the correct outcome is visible content, never a block stuck
    // at `opacity: 0` because an optional API was missing.
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      // Fires a little before the block is fully on screen, so the motion has
      // finished by the time the reader's eye arrives at it.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);

    // The backstop. A block still off screen when this fires simply appears
    // without motion, which is a far better outcome than staying invisible.
    const fallback = window.setTimeout(() => {
      setShown(true);
      observer.disconnect();
    }, FALLBACK_MS);

    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-shown={shown || undefined}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={clsx('nx-reveal', className)}
    >
      {children}
    </div>
  );
}
