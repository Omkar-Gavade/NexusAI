import { useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import clsx from 'clsx';

const OPEN_DELAY = 400;
const CLOSE_DELAY = 80;

/**
 * Supplementary only. A tooltip is unreachable on touch, so it never carries
 * information required to complete a task — icon-only controls also have an
 * aria-label, and that label is the accessible name.
 *
 * Keyboard focus opens it immediately; pointer hover waits, so sweeping the
 * cursor across a row of controls does not flash a trail of tooltips.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
}: {
  label: string;
  children: ReactElement;
  side?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const id = useId();

  const schedule = (next: boolean, delay: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), delay);
  };

  const content: ReactNode = open ? (
    <span
      role="tooltip"
      id={id}
      className={clsx(
        'pointer-events-none absolute left-1/2 z-(--z-dropdown) -translate-x-1/2 whitespace-nowrap',
        'rounded-overlay border border-line bg-floating px-2 py-1 text-micro text-ink shadow-float',
        'motion-safe:animate-[dropdown-in_140ms_var(--ease-out)]',
        side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
      )}
    >
      {label}
    </span>
  ) : null;

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => schedule(true, OPEN_DELAY)}
      onPointerLeave={() => schedule(false, CLOSE_DELAY)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {children}
      {content}
    </span>
  );
}
