import { Code2, Columns2, Lightbulb, Scale } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

/**
 * Starting points, each a complete prompt rather than a category name, so
 * picking one gives the composer something worth sending. They fill the
 * composer and stop there: the reader edits and sends — nothing is asked on
 * their behalf. None needs an attachment, because uploads do not exist yet.
 */
export const STARTERS = [
  {
    Icon: Columns2,
    title: 'Compare two technologies',
    prompt:
      'Compare PostgreSQL and MongoDB for a new SaaS product: data modelling, scaling and operational trade-offs.',
  },
  {
    Icon: Code2,
    title: 'Review some code',
    prompt: 'Review this function for bugs and edge cases, then suggest a cleaner version:\n\n',
  },
  {
    Icon: Lightbulb,
    title: 'Explain a difficult concept',
    prompt:
      'Explain how attention works in transformers, with an intuitive analogy and a small worked example.',
  },
  {
    Icon: Scale,
    title: 'Check an answer from more than one angle',
    prompt: 'Is it safe to keep JWTs in localStorage? Give the strongest case for and against.',
  },
] as const;

/**
 * The empty conversation: a welcome and four ways to begin.
 *
 * Centred, because on an empty page the composer and these starters are the
 * whole interface. It says once what the product does differently — one
 * model, several, or a comparison — and never names a provider, because
 * availability is per deployment and the composer reports it per model.
 */
export function EmptyConversation({
  disabled,
  name,
  onPickPrompt,
}: {
  disabled: boolean;
  name?: string | undefined;
  onPickPrompt?: ((prompt: string) => void) | undefined;
}) {
  const firstName = name?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto flex min-h-[52vh] max-w-[720px] flex-col items-center justify-center py-8 text-center motion-safe:animate-[nx-answer-in_260ms_var(--ease-out)]">
      <Logo size={44} className="shadow-glow rounded-[12px]" />

      {firstName && <p className="mt-6 text-ui font-medium text-ink-3">Hi {firstName},</p>}
      <h2
        className={
          firstName
            ? 'mt-1 text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink max-sm:text-[28px]'
            : 'mt-6 text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink max-sm:text-[28px]'
        }
      >
        Ask <span className="text-brand-gradient">anything.</span>
      </h2>

      {/*
        Every mode, because the composer offers every mode — one model, a
        reconciled synthesis, or a side-by-side comparison.
      */}
      <p className="mt-3 max-w-[54ch] text-body text-ink-2">
        Choose a model for a direct answer, let Smart Routing pick one, or put the question to
        several — reconciled into one synthesis, or compared side by side.
      </p>

      {!disabled && (
        <ul aria-label="Ways to start" className="mt-9 grid w-full gap-2.5 text-left sm:grid-cols-2">
          {STARTERS.map(({ Icon, title, prompt }) => (
            <li key={title}>
              <button
                type="button"
                onClick={() => onPickPrompt?.(prompt)}
                className="group flex h-full w-full items-start gap-3 rounded-card border border-line bg-raised/70 p-4 text-left shadow-float transition-[border-color,background-color,transform] duration-(--duration-quick) ease-out hover:-translate-y-px hover:border-line-strong hover:bg-raised"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-control bg-accent-quiet text-accent transition-colors duration-(--duration-quick) group-hover:bg-brand group-hover:text-white">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-ui font-medium text-ink">{title}</span>
                  <span className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-ink-3">
                    {prompt.trim()}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {disabled && (
        // Stated rather than left for the reader to discover by typing a
        // question and watching it fail.
        <p className="mt-6 max-w-[52ch] rounded-card border border-line bg-raised px-4 py-3 text-ui text-ink-2">
          No models are currently available, so a question cannot be answered right now.
        </p>
      )}
    </div>
  );
}
