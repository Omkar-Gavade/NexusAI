import clsx from 'clsx';
import { agreementSentence } from '@/lib/format';

/**
 * The product's shape, drawn: one question branches to several models, the
 * models converge on a synthesis, and a provenance rail runs beside the answer.
 *
 * The connectors are real geometry rather than three boxes stacked with
 * whitespace between them. Branching and converging are the whole idea — a
 * reader who sees only stacked cards has been told there are several models,
 * not shown what happens to them.
 *
 * Everything textual is a label the application actually renders or a neutral
 * placeholder bar: no invented model prose, no vendor name, no measured figure
 * this project did not measure. The counts come from the application's own
 * formatter, so the illustration cannot claim a result the workspace would not.
 */

/** The illustrated turn: three asked, two answered, one of those diverged. */
const TURN = { requested: 3, responded: 2, concur: 1, diverge: 1 } as const;

type State = 'concurs' | 'diverges' | 'no-response';

const LANES: ReadonlyArray<{ id: string; state: State; latency: string; bars: readonly string[] }> =
  [
    { id: 'model-a', state: 'concurs', latency: '1.2 s', bars: ['100%', '72%'] },
    { id: 'model-b', state: 'diverges', latency: '2.0 s', bars: ['88%', '100%'] },
    { id: 'model-c', state: 'no-response', latency: '—', bars: [] },
  ];

const STATE_LABEL: Record<State, string> = {
  concurs: 'CONCURS',
  diverges: 'DIVERGES',
  'no-response': 'NO RESPONSE',
};

/**
 * The branch and merge, as one SVG behind the lanes.
 *
 * `preserveAspectRatio="none"` lets it stretch to whatever width the grid
 * resolves to, so the connectors stay aligned with the columns without
 * measuring anything at runtime. Hidden below `sm`, where the lanes stack and
 * a horizontal fan would be drawing a relationship the layout no longer has.
 */
function Connectors({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 40"
      preserveAspectRatio="none"
      className={clsx('block h-8 w-full text-line', className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {/* Centre spine into, or out of, the single node. */}
        <path d={flip ? 'M150 40 V26' : 'M150 0 V14'} />
        {/* Shoulder joining the three lane centres. */}
        <path d={flip ? 'M50 26 H250' : 'M50 14 H250'} />
        {/* Drops to each lane. */}
        {[50, 150, 250].map((x) => (
          <path key={x} d={flip ? `M${x} 26 V0` : `M${x} 14 V40`} />
        ))}
      </g>
    </svg>
  );
}

function StateMark({ state }: { state: State }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'block h-0.5 w-full',
        state === 'concurs' && 'bg-line-strong',
        state === 'no-response' && 'bg-line',
        state === 'diverges' &&
          'bg-line-strong [mask-image:linear-gradient(to_right,#000_0_calc(50%-2px),transparent_calc(50%-2px)_calc(50%+2px),#000_calc(50%+2px)_100%)]',
      )}
    />
  );
}

export function FanOutDiagram() {
  return (
    <figure className="m-0">
      <p className="sr-only">
        An illustration of one question sent to three models. Model A concurs with the
        synthesis, Model B diverges from it, and Model C returned no response. A synthesis
        stage reconciles the two responses that arrived and reports{' '}
        {agreementSentence(TURN).toLowerCase()}.
      </p>

      <div aria-hidden="true" className="border border-line bg-canvas">
        <div className="flex items-center justify-between border-b border-line bg-workspace px-4 py-2.5">
          <span data-register="machine" className="text-note uppercase text-ink-3">
            Orchestration
          </span>
          <span data-register="machine" className="text-note uppercase text-ink-3">
            Auto · 3 models
          </span>
        </div>

        <div className="p-5 md:p-6">
          {/* --- Question --------------------------------------------------- */}
          <div className="mx-auto max-w-[62%] border border-line bg-raised px-4 py-3 max-sm:max-w-none">
            <span data-register="machine" className="text-note uppercase text-ink-3">
              One question
            </span>
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="block h-1.5 w-[88%] bg-hover" />
              <span className="block h-1.5 w-[52%] bg-hover" />
            </div>
          </div>

          <Connectors className="max-sm:hidden" />
          <div className="h-4 sm:hidden" />

          {/* --- Fan-out ---------------------------------------------------- */}
          <div className="grid gap-2.5 sm:grid-cols-3">
            {LANES.map((lane) => (
              <div
                key={lane.id}
                className={clsx(
                  'flex min-h-[112px] flex-col gap-2.5 border p-3',
                  lane.state === 'no-response' ? 'border-dashed border-line' : 'border-line',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span data-register="machine" className="text-note text-ink-2">
                    {lane.id}
                  </span>
                  <span data-register="machine" className="text-note text-ink-3">
                    {lane.latency}
                  </span>
                </div>

                {lane.bars.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {lane.bars.map((width, index) => (
                      <span key={index} className="block h-1.5 bg-hover" style={{ width }} />
                    ))}
                  </div>
                ) : (
                  <p className="text-ui text-ink-3">No response</p>
                )}

                <div className="mt-auto flex flex-col gap-1.5">
                  <StateMark state={lane.state} />
                  <span data-register="machine" className="text-note uppercase text-ink-3">
                    {STATE_LABEL[lane.state]}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Connectors className="max-sm:hidden" flip />
          <div className="h-4 sm:hidden" />

          {/* --- Synthesis, with the rail in the gutter ---------------------- */}
          <div className="border border-accent-quiet bg-workspace p-4">
            <div className="flex items-center justify-between">
              <span data-register="machine" className="text-note uppercase text-accent">
                Synthesis
              </span>
              <span data-register="machine" className="text-note uppercase text-ink-3">
                Streaming
              </span>
            </div>

            <div className="mt-3 flex gap-4">
              {/* One segment per model, in plan order — the same notation the
                  workspace uses, at the same two-pixel width. */}
              <ul className="flex w-0.5 shrink-0 flex-col gap-px self-stretch">
                {LANES.map((lane) => (
                  <li key={lane.id} className="min-h-0 w-full flex-1">
                    <span
                      className={clsx(
                        'block size-full',
                        lane.state === 'no-response' ? 'bg-line' : 'bg-line-strong',
                        lane.state === 'diverges' &&
                          '[mask-image:linear-gradient(to_bottom,#000_0_calc(50%-1px),transparent_calc(50%-1px)_calc(50%+1px),#000_calc(50%+1px)_100%)]',
                      )}
                    />
                  </li>
                ))}
              </ul>

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2">
                  {['100%', '96%', '100%', '58%'].map((width, index) => (
                    <span key={index} className="block h-2 bg-hover" style={{ width }} />
                  ))}
                </div>
                <p data-register="machine" className="mt-3.5 text-meta text-ink-3">
                  {agreementSentence(TURN)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <figcaption className="mt-3 text-micro text-ink-3">
        Representative interface. Static illustration — not live model output.
      </figcaption>
    </figure>
  );
}
