import clsx from 'clsx';

/**
 * A measure rule. Dividers span the reading measure, never the viewport, and
 * carry their label inline in the machine register — a full-bleed rule cuts the
 * page into bands, and bands are cards without borders.
 */
export function Rule({
  label,
  trailing,
  className,
  decorative = false,
}: {
  label?: string;
  trailing?: React.ReactNode;
  className?: string;
  /** Drops the separator role, for use inside a control that owns the label. */
  decorative?: boolean;
}) {
  if (!label) {
    return <hr className={clsx('border-t border-line-subtle', className)} />;
  }

  return (
    <div
      {...(decorative ? { 'aria-hidden': true } : { role: 'separator', 'aria-label': label })}
      className={clsx('flex items-center gap-2 select-none', className)}
    >
      <span className="h-px w-4 shrink-0 bg-line-subtle" />
      <span data-register="machine" className="text-note uppercase text-ink-3 shrink-0">
        {label}
      </span>
      <span className="h-px flex-1 bg-line-subtle" />
      {trailing}
    </div>
  );
}
