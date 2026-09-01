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

type State = 'concurs' | 'diverges' | 'unavailable';

/**
 * The lane ids are catalog model ids, the same strings the workspace prints in
 * a comparison card header. The third lane is `unavailable` rather than
 * `failed`: a deployment enables a model by holding that provider's credential,
 * and an unconfigured one reports itself unavailable before any request is
 * made. Drawing a named model as having failed would claim something about that
 * provider's reliability that this project has not measured.
 */
const LANES: ReadonlyArray<{ id: string; state: State; latency: string; bars: readonly string[] }> =
  [
    { id: 'gpt-4o', state: 'concurs', latency: '1.2 s', bars: ['100%', '72%'] },
    { id: 'gemini-flash', state: 'diverges', latency: '2.0 s', bars: ['88%', '100%'] },
    { id: 'mistral-large', state: 'unavailable', latency: '—', bars: [] },
  ];

/**
 * When each lane's response pulse returns, offset to match the latencies the
 * lanes display. The motion carries the same information the numbers do, so a
 * reader who watches rather than reads still learns that the models finish at
 * different times.
 */
const RETURN_DELAY = [1150, 1950, 0] as const;

const STATE_LABEL: Record<State, string> = {
  concurs: 'CONCURS',
  diverges: 'DIVERGES',
  unavailable: 'UNAVAILABLE',
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

      {/* One pulse per lane. Outbound they leave together — the fan-out is
          parallel. Returning, they are staggered by each lane's own latency,
          and the lane that never answered has none. */}
      <g className="text-accent">
        {[50, 150, 250].map((x, lane) =>
          flip && RETURN_DELAY[lane] === 0 ? null : (
            <rect
              key={x}
              className="nx-flow"
              style={{
                ['--nx-delay' as string]: `${flip ? RETURN_DELAY[lane] : lane * 90}ms`,
              }}
              x={x - 1}
              y={flip ? 0 : 14}
              width="2"
              height="13"
              fill="currentColor"
            />
          ),
        )}
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
        state === 'unavailable' && 'bg-line',
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
        An illustration of one question sent to three models. The first concurs with the
        synthesis, the second diverges from it, and the third is not configured in this
        deployment, so it is reported as unavailable. A synthesis stage reconciles the two
        responses that arrived and reports{' '}
        {agreementSentence(TURN).toLowerCase()}.
      </p>

      {/* `shadow-float` is the design system's own float elevation, defined
          per theme, so the frame lifts off whichever surface it sits on
          without a hand-rolled value that only reads correctly in one. */}
      <div aria-hidden="true" className="border border-line bg-canvas shadow-float">
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
                  'flex min-h-[112px] flex-col gap-2.5 border px-2.5 py-3',
                  lane.state === 'unavailable' ? 'border-dashed border-line' : 'border-line',
                )}
              >
                {/* One line, always. A wrapped model id reads as a layout
                    fault in what is meant to look like a product. */}
                <div className="flex items-baseline justify-between gap-1.5">
                  <span
                    data-register="machine"
                    className="min-w-0 truncate text-note text-ink-2"
                  >
                    {lane.id}
                  </span>
                  <span
                    data-register="machine"
                    className="shrink-0 whitespace-nowrap text-note text-ink-3"
                  >
                    {lane.latency}
                  </span>
                </div>

                {lane.bars.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {lane.bars.map((width, index) => (
                      <span key={index} className="block h-1.5" style={{ width }}>
                        <span
                          className="nx-fill block h-full bg-hover"
                          style={{
                            ['--nx-delay' as string]: `${index * 110}ms`,
                          }}
                        />
                      </span>
                    ))}
                  </div>
                ) : (
                  // No pulse and no fill: the lane breathes faintly, so the gap
                  // reads as "nothing arrived" rather than a broken element.
                  <p className="nx-idle text-ui text-ink-3">Not configured</p>
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
                        lane.state === 'unavailable' ? 'bg-line' : 'bg-line-strong',
                        lane.state === 'diverges' &&
                          '[mask-image:linear-gradient(to_bottom,#000_0_calc(50%-1px),transparent_calc(50%-1px)_calc(50%+1px),#000_calc(50%+1px)_100%)]',
                      )}
                    />
                  </li>
                ))}
              </ul>

              <div className="min-w-0 flex-1">
                {/* The answer accumulating. Starts after the lanes have
                    returned, so the sequence on screen is the real order:
                    fan out, come back, then write. */}
                <div className="flex flex-col gap-2">
                  {['100%', '96%', '100%', '58%'].map((width, index) => (
                    <span key={index} className="block h-2" style={{ width }}>
                      <span
                        className="nx-stream block h-full bg-hover"
                        style={{ ['--nx-delay' as string]: `${index * 120}ms` }}
                      />
                    </span>
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
