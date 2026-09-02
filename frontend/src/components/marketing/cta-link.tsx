import clsx from 'clsx';
import { Link } from 'react-router';
import type { ReactNode } from 'react';

/**
 * The marketing call-to-action.
 *
 * It exists because the primary-button treatment — inverted neutral fill,
 * control radius, 550 weight — was being restated at every CTA site, which is
 * how the landing page and the product drift apart one hover state at a time.
 *
 * It is not `Button`: `Button` renders a `<button>` and these are navigations.
 * A link that reports itself as a button is worse for assistive technology than
 * a small amount of shared styling.
 *
 * An in-page target (`#modes`) renders a native anchor rather than a router
 * `Link`. React Router resolves a hash-only `to` into a location and pushes it,
 * but it does not scroll to the element — the CTA would change the URL and
 * leave the reader where they were. The browser does that scroll natively, and
 * honours `scroll-behavior`, which `base.css` already switches to `auto` under
 * `prefers-reduced-motion`.
 */
export function CtaLink({
  to,
  variant = 'primary',
  size = 'lg',
  children,
  className,
}: {
  to: string;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'lg';
  children: ReactNode;
  className?: string;
}) {
  const classes = clsx(
    'inline-flex shrink-0 items-center justify-center rounded-control text-ui',
    'transition-[background-color,opacity,color] duration-(--duration-instant) ease-out',
    // `md` is 30px, which is under the 44px touch minimum the release
    // checklist sets below 1024px. `IconButton` solves this with a `before:`
    // hit area; a link with a visible fill cannot, so it grows instead.
    size === 'lg' ? 'h-(--control-lg) px-4' : 'h-(--control-md) px-3 max-lg:min-h-11',
    variant === 'primary'
      ? 'bg-ink font-[550] text-ink-inv hover:opacity-92'
      : 'border border-line-control text-ink hover:bg-hover',
    className,
  );

  if (to.startsWith('#')) {
    return (
      <a href={to} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={classes}>
      {children}
    </Link>
  );
}
