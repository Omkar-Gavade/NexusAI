import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'danger' | 'warning' | 'success' | 'info';

const TONE = {
  danger: { cls: 'border-danger/35 bg-danger-quiet text-danger', Icon: AlertCircle },
  warning: { cls: 'border-warn/35 bg-warn-quiet text-warn', Icon: AlertCircle },
  success: { cls: 'border-ok/35 bg-ok-quiet text-ok', Icon: CheckCircle2 },
  info: { cls: 'border-accent/35 bg-accent-quiet text-accent', Icon: Info },
} as const satisfies Record<Tone, { cls: string; Icon: typeof AlertCircle }>;

/**
 * Errors render where the failure happened, never in a toast that detaches the
 * problem from its context. Every alert answers, in order: what failed, what
 * was unaffected, what you can do.
 */
export function Alert({
  tone = 'danger',
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { cls, Icon } = TONE[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx('flex gap-2.5 border p-3', cls)}
    >
      <Icon size={15} aria-hidden="true" className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-ui font-[550] text-ink">{title}</p>
        {children && <div className="mt-1 text-micro text-ink-2">{children}</div>}
        {action && <div className="mt-2.5 flex gap-2">{action}</div>}
      </div>
    </div>
  );
}
