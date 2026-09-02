import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { routes } from '@/lib/routes';

/**
 * The wordmark, which goes home — and, when it is already home, goes to the top.
 *
 * A `Link` to the route you are already on is a no-op: React Router sees the
 * same location and renders nothing new, so clicking the logo halfway down the
 * page did nothing at all. Every other link in the header moves the reader
 * somewhere, and the one carrying the product's name was the one that felt
 * broken.
 *
 * It stays a `Link` rather than becoming an `href="#top"` anchor: the brand
 * link should leave a clean URL, not stamp a fragment onto it. The scroll is
 * the browser's — `base.css` sets `scroll-behavior: smooth` and switches it to
 * `auto` under `prefers-reduced-motion`, so this inherits both.
 */
export function HomeLink({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  const { pathname } = useLocation();
  const atHome = pathname === routes.home;

  return (
    <Link
      to={routes.home}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (!atHome) return;
        // Nothing to navigate to, so take over and scroll instead. Without
        // this the default is followed and the page does not move.
        event.preventDefault();
        window.scrollTo({ top: 0 });
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
