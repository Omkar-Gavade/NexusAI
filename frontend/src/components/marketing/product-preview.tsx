import clsx from 'clsx';
import { ChevronRight, Copy, MoreHorizontal, PanelLeft, RotateCcw, Send } from 'lucide-react';
import { agreementSentence, latency } from '@/lib/format';
import { ModelMark } from '@/features/chat/components/model-mark';

/**
 * The workspace, as a visitor will meet it.
 *
 * This is a static reconstruction of the real answer surface, assembled from
 * the same components and the same rules the application uses — not a second
 * design invented for the marketing site, and not a screenshot that would go
 * stale the moment the product moved. Every structural decision below is
 * copied from the implementation it depicts:
 *
 *   · the synthesis has NO container — no card, no border, no fill, no avatar.
 *     It is typeset prose on the canvas, because wrapping generated text in a
 *     bordered box halves the measure and makes long answers read like
 *     receipts. `answer-block.tsx` is emphatic about this and it is the single
 *     most recognisable thing about the surface.
 *   · the provenance rail is 2px, one segment per model, vertical in the left
 *     gutter at `lg` and horizontal above the metadata line below it —
 *     exactly the responsive behaviour in `provenance-rail.tsx`, including the
 *     notch that marks divergence and the neutral density ramp that identifies
 *     a model by position rather than by a vendor colour.
 *   · comparison cards are quieter than the synthesis: 13px on a raised
 *     surface against 16px on the canvas, so the evidence never competes with
 *     the conclusion. A diverging card carries the same structural mark the
 *     rail does.
 *
 * On the content: the interface is real, the exchange inside it is an
 * illustration and is captioned as one. The figures it prints are formatted by
 * the application's own `latency()` and `agreementSentence()`, so the metadata
 * line cannot claim a shape the workspace would never render. No measured
 * result is reported, no model is described as available, and no control is
 * drawn that the application does not have.
 */

/** Three models, in plan order. The ids are the catalog's own. */
const SLOTS = [
  {
    modelId: 'gpt-4o',
    stance: 'concurs',
    latencyMs: 1180,
    text: 'Tokyo. The imperial court moved from Kyoto to Edo in 1868 and the city was renamed Tokyo — literally “eastern capital”.',
  },
  {
    modelId: 'gemini-flash',
    stance: 'concurs',
    latencyMs: 2040,
    text: 'Tokyo. It has been the seat of the emperor and of the national government since the Meiji Restoration in 1868.',
  },
  {
    modelId: 'mistral-large',
    stance: 'diverges',
    latencyMs: 3120,
    text: 'Tokyo in practice, but Japan has no statute that formally designates a capital. Its status rests on the seat of government, not on a law naming it.',
  },
] as const;

/** The neutral four-step ramp from `provenance-rail.tsx`. */
const DENSITY = [1, 0.75, 0.5, 0.25] as const;

const TURN = { requested: 3, responded: 3, concur: 2, diverge: 1 } as const;
const TOTAL_MS = 3120;

const NOTCH_X =
  '[mask-image:linear-gradient(to_right,#000_0_calc(50%-1px),transparent_calc(50%-1px)_calc(50%+1px),#000_calc(50%+1px)_100%)]';
const NOTCH_Y =
  'lg:[mask-image:linear-gradient(to_bottom,#000_0_calc(50%-1px),transparent_calc(50%-1px)_calc(50%+1px),#000_calc(50%+1px)_100%)]';

export function ProductPreview() {
  return (
    <figure className="m-0">
      <p className="sr-only">
        A representation of the NexusAI workspace. A question has been sent to three models. The
        synthesised answer is shown as ordinary prose, with a provenance rail beside it recording
        one segment per model, and a comparison section below listing what each model returned and
        how long it took. Two models concur with the synthesis and one diverges from it.
      </p>

      <div
        aria-hidden="true"
        className={clsx(
          'overflow-hidden border border-line bg-canvas',
          // Restrained depth, from the design system's own float shadow. It is
          // defined per theme — heavier alpha in dark, lighter in light — so
          // the frame lifts off the section surface without a `dark:` variant
          // and without a hand-rolled value that only looks right in one theme.
          'shadow-float',
        )}
      >
        {/* --- Header: 44px, one title and two controls ------------------- */}
        <div className="flex h-(--header-height) shrink-0 items-center gap-1.5 border-b border-line px-2.5">
          <PanelLeft size={15} className="shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate text-ui text-ink-2">
            Capital of Japan
          </span>
          <MoreHorizontal size={15} className="shrink-0 text-ink-3" />
        </div>

        <div className="flex flex-col gap-6 px-4 py-5 md:px-7 md:py-7">
          {/* --- The prompt ---------------------------------------------- */}
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-control bg-raised px-3.5 py-2.5 text-body text-ink">
              What is the capital of Japan, and why?
            </div>
          </div>

          {/* --- The answer -----------------------------------------------
              The nesting matters and is copied from `answer-block.tsx`: the
              rail is a sibling of the *synthesis only*, so it measures the
              answer. The metadata line and the comparison sit below that row,
              indented by the rail's width plus its gutter, which is why they
              line up with the prose without being wrapped by the rail. Putting
              them inside the row instead stretches the rail down past the
              comparison cards and makes it measure the wrong thing. */}
          <div>
            <div className="flex gap-(--rail-gutter) max-lg:flex-col max-lg:gap-3">
              <ul className="flex select-none gap-px max-lg:order-2 max-lg:h-0.5 max-lg:w-full max-lg:flex-row lg:h-auto lg:w-0.5 lg:flex-col lg:self-stretch">
                {SLOTS.map((slot, index) => (
                  <li key={slot.modelId} className="h-full min-h-0 min-w-0 flex-1 lg:w-full">
                    <span
                      className={clsx(
                        'block size-full bg-line-strong',
                        slot.stance === 'diverges' && [NOTCH_X, NOTCH_Y],
                      )}
                      style={{ opacity: DENSITY[index % DENSITY.length] }}
                    />
                  </li>
                ))}
              </ul>

              {/* The synthesis: prose on the canvas, no container. */}
              <div className="min-w-0 flex-1 max-lg:order-1">
                <div className="flex max-w-[68ch] flex-col gap-3.5 text-body leading-[1.65] text-ink">
                  <p>
                    Tokyo. The imperial court moved from Kyoto to Edo in 1868, at the Meiji
                    Restoration, and the city was renamed Tokyo — “eastern capital”. The
                    emperor and the national government have been based there since.
                  </p>
                  <p>
                    The models part company on one point. Two treat Tokyo as the capital
                    outright; the third notes that no Japanese statute actually designates one,
                    so the title rests on where the government sits rather than on a law that
                    names it.
                  </p>
                </div>
              </div>
            </div>

            {/* Metadata, in the machine register so it can never be read as part
                of the answer. Both figures come from the application's own
                formatters. */}
            <div className="mt-4 flex min-h-(--control-sm) items-center gap-3 lg:pl-[calc(var(--rail-width)+var(--rail-gutter))]">
              <p data-register="machine" className="text-meta text-ink-3">
                {`${agreementSentence(TURN)} · ${latency(TOTAL_MS).toUpperCase()}`}
              </p>
              <div className="flex items-center gap-1.5 text-ink-3">
                <Copy size={13} />
                <RotateCcw size={13} />
              </div>
            </div>

            {/* --- Comparison, open ------------------------------------- */}
            <div className="mt-2 lg:pl-[calc(var(--rail-width)+var(--rail-gutter))]">
              <div className="flex select-none items-center gap-2 py-1">
                <span className="h-px w-4 shrink-0 bg-line-subtle" />
                <span data-register="machine" className="shrink-0 text-note uppercase text-ink-3">
                  Comparison
                </span>
                <span className="h-px flex-1 bg-line-subtle" />
                <ChevronRight size={13} className="shrink-0 rotate-90 text-ink-3" />
              </div>

              <div className="mt-3 flex flex-col gap-3">
                {SLOTS.map((slot, index) => (
                  <article
                    key={slot.modelId}
                    className={clsx(
                      'border border-line bg-raised',
                      slot.stance === 'diverges' && 'border-l-2 border-l-line-strong',
                    )}
                  >
                    <header className="flex h-8 items-center gap-2 border-b border-line px-3">
                      <ModelMark index={index} />
                      <h4 data-register="machine" className="truncate text-meta text-ink-2">
                        {slot.modelId}
                      </h4>
                      <span className="flex-1" />
                      <span
                        data-register="machine"
                        className="shrink-0 whitespace-nowrap text-meta text-ink-3"
                      >
                        {`${slot.stance} · ${latency(slot.latencyMs)}`}
                      </span>
                    </header>
                    <div className="p-3">
                      <p className="text-ui leading-5 text-ink-2">{slot.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          {/* --- Composer -------------------------------------------------- */}
          <div className="rounded-control border border-line-control bg-workspace p-3">
            <p className="text-body text-ink-off">Ask anything…</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                data-register="machine"
                className="rounded-control border border-line px-2 py-1 text-note uppercase text-ink-3"
              >
                Auto
              </span>
              <span className="flex-1" />
              <span className="flex size-(--control-sm) items-center justify-center rounded-control bg-hover text-ink-3">
                <Send size={13} />
              </span>
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
