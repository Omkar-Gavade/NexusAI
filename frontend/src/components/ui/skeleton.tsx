import clsx from 'clsx';

/**
 * Matches the final dimensions of what it replaces, so nothing reflows when the
 * content lands. Callers gate on 200ms of pending state — flashing a skeleton
 * for a 40ms cache hit is worse than showing nothing.
 */
export function Skeleton({
  width,
  height = 20,
  className,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      style={{ width, height }}
      className={clsx(
        'rounded-mark bg-hover',
        // Reduced motion drops the pulse; the layout signal survives.
        'motion-safe:animate-[skeleton_1.4s_ease-in-out_infinite_alternate]',
        className,
      )}
    />
  );
}
