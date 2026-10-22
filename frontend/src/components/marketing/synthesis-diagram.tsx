import clsx from 'clsx';
import { agreementSentence } from '@/lib/format';
import { HUES, type Hue } from './spectrum';

/**
 * The product's central mechanic, drawn once: one question fans out to several
 * models, they do not all agree and they do not all answer, and a synthesis
 * stage reconciles what came back.
 *
 * Everything textual here is either a label the product actually uses or a
 * neutral placeholder bar. There is no invented model output, no vendor name
 * and no latency figure, for the same reason the product refuses to display
 * them: nobody measured any of it.
 *
 * The metadata line is produced by the application's own formatter rather than
 * written out by hand, so the marketing page cannot drift away from what the
 * workspace would actually render for this shape of turn.
 */

const SYNTHESIS_LINES = ['100%', '94%', '100%', '68%'] as const;

/** The illustrated turn: three asked, two answered, one of those diverged. */
const ILLUSTRATED_AGREEMENT = { requested: 3, responded: 2, concur: 1, diverge: 1 } as const;

type LaneState = 'concurs' | 'diverges' | 'no-response';

/*
 * Each lane has a hue so the three models can be told apart at a glance. The
 * hue names the model, never its stance: agreement is the segment below.
 */
const LANES: ReadonlyArray<{
  label: string;
  state: LaneState;
  lines: readonly string[];
  hue: Hue;
}> = [
  { label: 'Model A', state: 'concurs', lines: ['100%', '82%', '61%'], hue: HUES.indigo },
  { label: 'Model B', state: 'diverges', lines: ['92%', '70%'], hue: HUES.cyan },
  { label: 'Model C', state: 'no-response', lines: [], hue: HUES.rose },
];

const STATE_LABEL: Record<LaneState, string> = {
  concurs: 'CONCURS',
  diverges: 'DIVERGES',
  'no-response': 'NO RESPONSE',
};

/** A short vertical connector. Structure, not decoration — so it stays square. */
function Connector({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={clsx('block w-0.5 rounded-full bg-gradient-to-b from-[#8b5cf6] to-[#d946ef] opacity-60', className)}
    />
  );
}

function Lane({ label, state, lines, hue }: (typeof LANES)[number]) {
  const failed = state === 'no-response';

  return (
    <div
      className={clsx(
        'relative flex min-h-[132px] flex-col gap-3 overflow-hidden rounded-card border bg-raised p-4',
        failed ? 'border-dashed border-line' : 'border-line shadow-float',
      )}
    >
      {!failed && (
        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: hue.gradient }} />
      )}
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className={clsx('size-2 shrink-0 rounded-full', failed && 'opacity-40')}
            style={{ backgroundImage: hue.gradient }}
          />
          <span data-register="machine" className="text-note uppercase text-ink-2">
            {label}
          </span>
        </span>
        <span
          data-register="machine"
          className={clsx('text-note uppercase', failed ? 'text-ink-3' : 'text-ink-2')}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      {failed ? (
        // A model that did not answer renders hollow rather than being dropped:
        // the gap is the information.
        <p className="text-ui text-ink-3">This model did not return a response.</p>
      ) : (
        <div aria-hidden="true" className="flex flex-col gap-2">
          {lines.map((width, index) => (
            // Indexed because these are decorative placeholders in a fixed
            // list, and two lines may legitimately share a width.
            <span
              key={index}
              className="block h-1.5 rounded-full"
              style={{ width, backgroundColor: `rgb(${hue.rgb} / 0.32)` }}
            />
          ))}
        </div>
      )}

      {/* Divergence is a break in the segment, never a colour — the same
          encoding the workspace rail uses, so the page teaches the product. */}
      <span
        aria-hidden="true"
        className={clsx(
          'mt-auto block h-0.5 w-full',
          failed && 'bg-line',
          state === 'concurs' && 'bg-line-strong',
          state === 'diverges' &&
            'bg-line-strong [mask-image:linear-gradient(to_right,#000_0_calc(50%-2px),transparent_calc(50%-2px)_calc(50%+2px),#000_calc(50%+2px)_100%)]',
        )}
      />
    </div>
  );
}

export function SynthesisDiagram() {
  return (
    <figure className="m-0">
      {/* One description of the whole figure, rather than a screen reader
          walking a decorative grid of bars. */}
      <p className="sr-only">
        An illustration of one question sent to three models. Model A concurs with the
        synthesis, Model B diverges from it, and Model C returned no response. The synthesis
        below reconciles the two responses that arrived, and reports{' '}
        {agreementSentence(ILLUSTRATED_AGREEMENT).toLowerCase()}.
      </p>

      <div aria-hidden="true" className="flex flex-col items-center">
        {/* --- The question ------------------------------------------------ */}
        <div className="w-full max-w-[420px] rounded-card border border-line bg-raised px-4 py-3 shadow-float">
          <span data-register="machine" className="text-note uppercase text-ink-3">
            One question
          </span>
          <div className="mt-2 flex flex-col gap-2">
            <span className="block h-1.5 w-[86%] rounded-full bg-hover" />
            <span className="block h-1.5 w-[54%] rounded-full bg-hover" />
          </div>
        </div>

        <Connector className="h-6" />

        {/* --- Fan-out ------------------------------------------------------ */}
        <div className="grid w-full gap-3 sm:grid-cols-3">
          {LANES.map((lane) => (
            <Lane key={lane.label} {...lane} />
          ))}
        </div>

        <Connector className="h-6" />

        {/* --- Synthesis ---------------------------------------------------- */}
        {/* The synthesis carries every lane's colour: it is made of them. */}
        <div className="w-full rounded-card bg-spectrum p-px shadow-[0_18px_48px_-20px_rgb(139_92_246/0.6)]">
          <div className="rounded-[13px] bg-raised p-4 md:p-5">
            <span data-register="machine" className="text-note uppercase text-accent">
              Synthesis
            </span>

            <div className="mt-3 flex flex-col gap-2.5">
              {SYNTHESIS_LINES.map((width, index) => (
                <span
                  key={index}
                  className="block h-2 rounded-full bg-spectrum opacity-45"
                  style={{ width }}
                />
              ))}
            </div>

            <p data-register="machine" className="mt-4 text-meta text-ink-3">
              {agreementSentence(ILLUSTRATED_AGREEMENT)}
            </p>
          </div>
        </div>
      </div>

      <figcaption className="mt-3 text-micro text-ink-3">
        Illustration of the flow. Static — not live model output.
      </figcaption>
    </figure>
  );
}
