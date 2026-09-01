import clsx from 'clsx';

/**
 * What happens when the model writing the answer is the one that fails.
 *
 * This is not an illustration of an aspiration. The orchestrator selects a
 * synthesis model, and if that model fails *before any text has streamed* it
 * moves to the next eligible one and the turn completes. Failing over after
 * text has reached the reader is deliberately not done — rewriting an answer
 * someone is already reading would be worse than the failure.
 *
 * The stage labels are the states the backend actually records. Nothing here
 * claims a provider is always available, and nothing simulates a recovery the
 * system does not perform.
 */

type Stage = {
  id: string;
  label: string;
  state: 'failed' | 'active' | 'done';
  detail: string;
};

const STAGES: readonly Stage[] = [
  { id: 'model-a', label: 'Synthesis attempt', state: 'failed', detail: 'RATE_LIMITED' },
  { id: 'model-b', label: 'Next eligible model', state: 'active', detail: 'Streaming' },
  { id: 'answer', label: 'Answer', state: 'done', detail: 'Complete' },
];

export function FailoverDiagram() {
  return (
    <figure className="m-0">
      <p className="sr-only">
        An illustration of synthesis failover. The first synthesis model is rate-limited before
        any text has streamed, so the orchestrator moves to the next eligible model and the turn
        completes. The models that already answered are not asked again, and the failure is
        recorded rather than hidden.
      </p>

      <ol aria-hidden="true" className="m-0 flex flex-col gap-0 p-0">
        {STAGES.map((stage, index) => {
          const last = index === STAGES.length - 1;

          return (
            <li key={stage.id} className="relative flex gap-4 pb-6 last:pb-0">
              {/* The path between stages. Solid once passed; the segment out of
                  the failed attempt is broken, the same notation the rail uses
                  for divergence. */}
              {!last && (
                <span
                  aria-hidden="true"
                  className={clsx(
                    'absolute bottom-1 left-[5px] top-4 w-px',
                    stage.state === 'failed'
                      ? 'bg-line [mask-image:linear-gradient(to_bottom,#000_0_calc(50%-3px),transparent_calc(50%-3px)_calc(50%+3px),#000_calc(50%+3px)_100%)]'
                      : 'bg-line-strong',
                  )}
                />
              )}

              <span
                className={clsx(
                  'relative z-10 mt-1.5 block size-2.5 shrink-0 rounded-mark border',
                  stage.state === 'failed' && 'border-line bg-canvas',
                  stage.state === 'active' && 'border-accent bg-accent-quiet',
                  stage.state === 'done' && 'border-line-strong bg-line-strong',
                )}
              />

              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={clsx(
                      'text-ui font-[550]',
                      stage.state === 'failed' ? 'text-ink-3' : 'text-ink',
                    )}
                  >
                    {stage.label}
                  </span>
                  <span
                    data-register="machine"
                    className={clsx(
                      'text-note uppercase',
                      stage.state === 'active' ? 'text-accent' : 'text-ink-3',
                    )}
                  >
                    {stage.detail}
                  </span>
                </div>

                {stage.state === 'failed' && (
                  <p className="mt-1.5 max-w-[46ch] text-ui text-ink-2">
                    Recorded against the provider, and reported in the answer’s provenance. It
                    is not retried and not hidden.
                  </p>
                )}
                {stage.state === 'active' && (
                  <p className="mt-1.5 max-w-[46ch] text-ui text-ink-2">
                    Chosen only because nothing had streamed yet. The models that already
                    answered are not asked again.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <figcaption className="mt-4 text-micro text-ink-3">
        Illustration of the implemented failover path. Static — not live model output.
      </figcaption>
    </figure>
  );
}
