import { useId } from 'react';
import clsx from 'clsx';

/**
 * A nexus is a point where lines meet: three strokes converging on one vertex,
 * set in the brand gradient as an app-icon tile. No robot, no brain, no spark.
 *
 * `plain` draws the glyph alone in `currentColor`, for quiet placements such
 * as a loading fallback.
 */
export function Logo({
  size = 18,
  className,
  plain = false,
}: {
  size?: number;
  className?: string;
  plain?: boolean;
}) {
  const id = useId();
  const gradient = `nx-logo-${id.replace(/[^a-zA-Z0-9-]/g, '')}`;

  if (plain) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={clsx('shrink-0', className)}>
        <path d="M4.5 5.5 L12 14.8 M12 3.5 L12 14.8 M19.5 5.5 L12 14.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="15.4" r="2.9" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={clsx('shrink-0', className)}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F46E5" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill={`url(#${gradient})`} />
      <path
        d="M7 7.2 L12 13.4 M12 5.6 L12 13.4 M17 7.2 L12 13.4"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="14.6" r="2.4" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx('font-human text-[15px] font-semibold tracking-[-0.02em] text-ink', className)}>
      NexusAI
    </span>
  );
}
