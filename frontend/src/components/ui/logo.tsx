import clsx from 'clsx';

/**
 * A nexus is a point where lines meet. Three strokes converging on one vertex,
 * and a single dot in the accent — the only place the brand asserts colour.
 * No robot, no brain, no spark, no orb.
 */
export function Logo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={clsx('shrink-0', className)}
    >
      {/* Three strokes converging on one vertex. The dot sits AT the meeting
          point, not below it — detached, it reads as a letter with a full stop
          rather than as a nexus. */}
      <path
        d="M4.5 5.5 L12 14.8 M12 3.5 L12 14.8 M19.5 5.5 L12 14.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="15.4" r="2.9" className="fill-accent" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx('font-human text-ui font-[550] tracking-[-0.01em] text-ink', className)}>
      NexusAI
    </span>
  );
}
