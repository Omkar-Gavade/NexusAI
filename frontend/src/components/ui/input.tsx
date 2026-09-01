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
      <label htmlFor={inputId} className="text-ui text-ink-2">
        {label}
      </label>

      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          'h-(--control-md) w-full rounded-control border bg-canvas px-2 text-ui text-ink',
          'placeholder:text-ink-off',
          'transition-[border-color] duration-(--duration-instant) ease-out',
          'hover:border-line-strong focus-visible:border-accent',
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
