import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
}

/**
 * A visible label always. A placeholder is not a label — it disappears the
 * moment the field is used, which is when the label matters most.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>

      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          'h-(--control-lg) w-full rounded-control border bg-canvas px-3.5 text-ui text-ink',
          'placeholder:text-ink-3',
          'transition-[border-color,box-shadow] duration-(--duration-quick) ease-out',
          // A soft glow rather than the global ring: the field already has a
          // border, and the ring around it read as two outlines.
          'hover:border-line-strong focus-visible:border-accent',
          'focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_20%,transparent)]',
          'disabled:bg-workspace disabled:text-ink-off',
          error ? 'border-danger' : 'border-line-control',
        )}
        {...props}
      />

      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-micro text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-micro text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
