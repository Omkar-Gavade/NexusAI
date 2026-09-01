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
  return (
    <Link
      to={to}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-control text-ui',
        'transition-[background-color,opacity,color] duration-(--duration-instant) ease-out',
        size === 'lg' ? 'h-(--control-lg) px-4' : 'h-(--control-md) px-3',
        variant === 'primary'
          ? 'bg-ink font-[550] text-ink-inv hover:opacity-92'
          : 'border border-line-control text-ink hover:bg-hover',
        className,
      )}
    >
      {children}
    </Link>
  );
}
