import clsx from 'clsx';
import { ROSTER } from './model-roster';

/**
 * The orchestration graph: question → fan-out → models → convergence →
 * synthesis → answer.
 *
 * One SVG, drawn on a fixed 720×260 viewBox and scaled by the container, so
 * the geometry is authored once and every node stays on its path at any width.
 *
 * The motion is the point rather than the decoration. Particles leave the
 * question **together** because the fan-out is parallel, and return **staggered**
 * because the models do not finish together — that is the single most important
 * fact about the product and the animation is what says it. The lane that
 * fails has no returning particle at all, so the gap is visible rather than
 * described.
 *
 * `offset-path` follows the same `d` string the visible stroke uses, so a
 * particle can never drift off its line: there is one definition of where the
 * path is.
 */

type Lane = {
  id: string;
  label: string;
  /** Where the response arrives, relative to the others. */
  returnsAt: number | null;
  state: 'ok' | 'unavailable';
};

/**
 * The lanes are labelled with real models, taken from `ROSTER` — the list that
 * `model-roster.test.ts` holds equal to `backend/src/domain/models/catalog.ts`.
 * Importing it rather than retyping the names means this diagram cannot drift
 * from the catalog either, and needs no second exemption from the lint rule
 * that keeps provider identifiers out of the UI.
 *
 * The third lane is marked `unavailable`, not `failed`. That distinction is
 * deliberate and it is about honesty, not wording: a deployment enables a model
 * by holding that provider's credential, and one that is not configured reports
 * itself unavailable before the request is made. Drawing a named vendor as
 * having *failed* would assert something about that company's reliability which
 * this project has never measured. Unavailability is a fact about the
 * deployment, which is exactly what the diagram is illustrating.
 */
const LANES: readonly Lane[] = [
  { id: 'a', label: ROSTER[0].model, returnsAt: 0, state: 'ok' },
  { id: 'b', label: ROSTER[2].model, returnsAt: 420, state: 'ok' },
  { id: 'c', label: ROSTER[3].model, returnsAt: null, state: 'unavailable' },
];

/** Vertical centre of each lane in viewBox units, paired with the lane. */
const ROWS = LANES.map((lane, index) => ({ ...lane, y: [58, 130, 202][index] as number }));
const FAN_X = 236;
const MERGE_X = 470;

const outbound = (y: number) => `M168 130 H${196} C${FAN_X} 130 ${FAN_X} ${y} ${268} ${y}`;
const inbound = (y: number) => `M400 ${y} C${MERGE_X} ${y} ${MERGE_X} 130 ${502} 130`;

export function OrchestrationGraph({ className }: { className?: string }) {
  return (
    <figure className={clsx('m-0 mx-auto max-w-[860px]', className)}>
      <p className="sr-only">
        A diagram of one question being sent to three models at the same time. Two return
        responses, at different times because the models run independently; the third is not
        configured in this deployment and is reported unavailable. A synthesis stage reconciles
        the responses that arrived and streams a single answer.
      </p>

      <div className="border border-line bg-canvas">
        <div className="flex items-center justify-between border-b border-line bg-workspace px-4 py-2.5">
          <span data-register="machine" className="text-note uppercase text-ink-3">
            Orchestration
          </span>
          <span data-register="machine" className="text-note uppercase text-ink-3">
            Parallel · 3 models
          </span>
        </div>

        <svg
          aria-hidden="true"
          viewBox="0 0 720 260"
          className="block w-full"
          style={{ overflow: 'visible' }}
        >
          {/* --- Paths ------------------------------------------------------ */}
          <g fill="none" stroke="currentColor" className="text-line" strokeWidth="1.25">
            {ROWS.map((row) => (
              <path key={`out-${row.id}`} d={outbound(row.y)} />
            ))}
            {ROWS.map((row) =>
              row.state === 'unavailable' ? null : <path key={`in-${row.id}`} d={inbound(row.y)} />,
            )}
            {/* Synthesis → answer. */}
            <path d="M604 130 H648" />
          </g>

          {/* An unavailable lane's return path is drawn broken, the same
              notation the provenance rail uses for a segment that contributed
              nothing. */}
          <path
            d={inbound(ROWS[ROWS.length - 1]?.y ?? 202)}
            fill="none"
            strokeWidth="1.25"
            strokeDasharray="3 6"
            stroke="currentColor"
            className="text-line"
          />

          {/* --- Travelling particles --------------------------------------- */}
          {ROWS.map((row, index) => (
            <circle
              key={`p-out-${row.id}`}
              r="3"
              className="nx-particle text-accent"
              fill="currentColor"
              style={{
                offsetPath: `path("${outbound(row.y)}")`,
                animationDelay: `${index * 70}ms`,
              }}
            />
          ))}
          {ROWS.map((row) =>
            row.returnsAt === null ? null : (
              <circle
                key={`p-in-${row.id}`}
                r="3"
                className="nx-particle text-accent"
                fill="currentColor"
                style={{
                  offsetPath: `path("${inbound(row.y)}")`,
                  animationDelay: `${1250 + row.returnsAt}ms`,
                }}
              />
            ),
          )}

          {/* --- Stage labels ------------------------------------------------
              The two edges are where the product's behaviour actually lives:
              one question becoming three requests, and three responses
              becoming one answer. Naming them costs two lines of 9px machine
              type and saves the reader inferring it from the geometry. */}
          <g
            className="fill-(--text-tertiary) text-[9px] uppercase"
            style={{ fontFamily: 'var(--font-machine)', letterSpacing: '0.08em' }}
          >
            <text x={236} y={30} textAnchor="middle">
              fan-out
            </text>
            <text x={470} y={30} textAnchor="middle">
              responses
            </text>
          </g>

          {/* --- Nodes ------------------------------------------------------- */}
          <Node x={72} y={130} w={96} label="Question" />
          {ROWS.map((row) => (
            <Node
              key={row.id}
              x={334}
              y={row.y}
              w={132}
              label={row.label}
              muted={row.state === 'unavailable'}
              dashed={row.state === 'unavailable'}
              caption={row.state === 'unavailable' ? 'unavailable' : undefined}
            />
          ))}
          <Node x={553} y={130} w={102} label="Synthesis" accent />
          <Node x={684} y={130} w={72} label="Answer" />
        </svg>
      </div>

      <figcaption className="mt-3 text-micro text-ink-3">
        Representative orchestration. Static illustration — not live model output. The
        unavailable lane shows the path when a model is not configured, not a measurement of
        any provider.
      </figcaption>
    </figure>
  );
}

/** A labelled box centred on (x, y), in viewBox units. */
function Node({
  x,
  y,
  w,
  label,
  caption,
  accent = false,
  muted = false,
  dashed = false,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  caption?: string | undefined;
  accent?: boolean;
  muted?: boolean;
  dashed?: boolean;
}) {
  const h = caption ? 44 : 34;

  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx="3"
        className={clsx(accent ? 'text-accent-quiet' : 'text-line')}
        fill="var(--surface-raised)"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray={dashed ? '3 4' : undefined}
      />
      <text
        x={x}
        y={caption ? y - 3 : y + 4}
        textAnchor="middle"
        className={clsx(
          'text-[11px]',
          accent ? 'fill-(--accent)' : muted ? 'fill-(--text-tertiary)' : 'fill-(--text-secondary)',
        )}
        style={{ fontFamily: 'var(--font-machine)' }}
      >
        {label}
      </text>
      {caption && (
        <text
          x={x}
          y={y + 13}
          textAnchor="middle"
          className="fill-(--text-tertiary) text-[10px]"
          style={{ fontFamily: 'var(--font-machine)' }}
        >
          {caption}
        </text>
      )}
    </g>
  );
}
