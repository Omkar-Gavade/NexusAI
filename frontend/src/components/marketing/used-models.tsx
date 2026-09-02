import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { agreementSentence } from '@/lib/format';

/**
 * What the answer records about itself.
 *
 * The rail beside an answer is geometry; this is the same information in
 * words, which is what the workspace shows when a reader opens the provenance
 * row. Both come from the turn, not from the selector — an answer read six
 * months later reports the models that produced it, whatever is selected then.
 *
 * The failed model keeps its place. Dropping it would make a three-model turn
 * look like a two-model turn that went perfectly, which is the specific lie
 * this display exists to prevent.
 */

const TURN = { requested: 3, responded: 2, concur: 1, diverge: 1 } as const;

const MODELS = [
  { name: 'Gemini 2.5 Flash', outcome: 'concurs' },
  { name: 'GPT-OSS 120B', outcome: 'diverges' },
  { name: 'Mistral Large', outcome: 'failed' },
] as const;

const OUTCOME_LABEL = {
  concurs: 'CONCURS',
  diverges: 'DIVERGES',
  failed: 'NO RESPONSE',
} as const;

export function UsedModels() {
  return (
    <div className="max-w-[38rem] border border-line bg-canvas p-6">
      <span data-register="machine" className="text-note uppercase text-ink-3">
        Used models
      </span>

      <ul className="mt-4 flex flex-col divide-y divide-line-subtle">
        {MODELS.map((model) => {
          const failed = model.outcome === 'failed';

          return (
            <li key={model.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              {failed ? (
                <X size={13} aria-hidden="true" className="shrink-0 text-ink-3" />
              ) : (
                <Check size={13} aria-hidden="true" className="shrink-0 text-accent" />
              )}

              <span className={clsx('min-w-0 flex-1 truncate text-ui', failed ? 'text-ink-3' : 'text-ink')}>
                {model.name}
              </span>

              {/* Stance is a judgement the synthesis pass made, so it is
                  printed as the machine notation it is rather than as prose. */}
              <span data-register="machine" className="shrink-0 text-note uppercase text-ink-3">
                {OUTCOME_LABEL[model.outcome]}
              </span>
            </li>
          );
        })}
      </ul>

      <p
        data-register="machine"
        className="mt-5 border-t border-line-subtle pt-4 text-note uppercase text-ink-2"
      >
        {agreementSentence(TURN)} · SYNTHESISED
      </p>
    </div>
  );
}
