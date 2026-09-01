import clsx from 'clsx';

/**
 * The only indeterminate indicator in the product, and it appears only inside
 * controls. Loading a region uses a skeleton at the final dimensions instead —
 * a spinner where content will be is louder than the content it replaces.
 */
export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={clsx('animate-spin', className)}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.75" />
      <path
        d="M8 1.5A6.5 6.5 0 0 1 14.5 8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
