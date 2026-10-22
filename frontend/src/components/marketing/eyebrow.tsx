import clsx from 'clsx';

/**
 * A section's eyebrow: a short label in the accent, above the headline.
 * `separator` keeps the semantics the measure rule had for assistive tech.
 */
export function Eyebrow({ label, className }: { label: string; className?: string }) {
  return (
    <p
      role="separator"
      aria-label={label}
      className={clsx(
        'inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-accent',
        className,
      )}
    >
      <span aria-hidden="true" className="h-0.5 w-7 rounded-full bg-spectrum" />
      {label}
    </p>
  );
}
