import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  /** Escape hatch for layout only — never for colour, radius, or spacing. */
  className?: string;
  children: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  // The highest-contrast option available (15.6:1 dark, 17.7:1 light) and the
  // most restrained, which keeps the accent free to mean focus and selection.
  // The brand gradient marks the one action a screen is asking for. White on
  // #4F46E5→#7C3AED measures 5.7–6.3:1.
  primary:
    'bg-brand text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_6px_20px_-8px_rgb(99_102_241/0.6)] hover:brightness-110 active:brightness-95 disabled:bg-none disabled:bg-hover disabled:text-ink-off disabled:shadow-none',
  secondary:
    'border border-line bg-raised text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] hover:border-line-strong hover:bg-hover active:bg-active disabled:text-ink-off disabled:border-line',
  ghost:
    'text-ink-2 hover:bg-hover hover:text-ink active:bg-active disabled:text-ink-off disabled:bg-transparent',
  danger: 'bg-danger text-white hover:opacity-92 active:opacity-85 disabled:opacity-50',
};

const SIZE: Record<Size, string> = {
  sm: 'h-(--control-sm) px-2.5 gap-1 text-[13px]',
  md: 'h-(--control-md) px-3.5 gap-1.5 text-ui',
  lg: 'h-(--control-lg) px-5 gap-2 text-ui',
};

/**
 * Four variants, no fifth. Note the absence of a press transform: a 30px
 * control that shrinks on click reads as a glitch, not as feedback.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      // Width is frozen while loading so the button does not resize mid-action.
      aria-busy={loading || undefined}
      disabled={props.disabled ?? loading}
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center rounded-control',
        'font-human whitespace-nowrap select-none',
        'transition-[background-color,border-color,color,filter,box-shadow] duration-(--duration-instant) ease-out',
        'font-medium',
        variant === 'primary' && 'font-semibold',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {/* Label holds its place at zero opacity rather than being replaced, so
          the control cannot change width between states. */}
      <span className={clsx('inline-flex items-center gap-1', loading && 'opacity-0')}>
        {icon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={13} />
        </span>
      )}
    </button>
  );
});
