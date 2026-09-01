import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Spinner } from './spinner';

type Variant = 'ghost' | 'secondary' | 'primary';
type Size = 'sm' | 'md' | 'lg';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  /** Required: there is no way to construct an unlabelled icon button. */
  label: string;
  icon: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  active?: boolean;
  className?: string;
}

const VARIANT: Record<Variant, string> = {
  ghost: 'text-ink-3 hover:bg-hover hover:text-ink active:bg-active',
  secondary: 'border border-line-control text-ink-2 hover:bg-hover hover:text-ink',
  primary: 'bg-ink text-ink-inv hover:opacity-92',
};

const SIZE: Record<Size, string> = {
  sm: 'size-(--control-sm)',
  md: 'size-(--control-md)',
  lg: 'size-(--control-lg)',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', loading = false, active = false, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-busy={loading || undefined}
      disabled={props.disabled ?? loading}
      className={clsx(
        'relative inline-grid shrink-0 place-items-center rounded-full',
        'transition-[background-color,color,opacity] duration-(--duration-instant) ease-out',
        'disabled:text-ink-off disabled:hover:bg-transparent',
        // Below the desktop breakpoint the hit area grows to the 44px touch
        // minimum while the visual box stays 30px, so layout is unaffected.
        'before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2',
        'before:-translate-y-1/2 before:content-[""] lg:before:hidden',
        active && 'bg-active text-ink',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={13} /> : icon}
    </button>
  );
});
