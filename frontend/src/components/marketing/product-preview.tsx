import clsx from 'clsx';

/**
 * A representative rendering of the answer surface, built from the product's own
 * design language rather than a screenshot or a second visual system.
 *
 * Everything here is static and clearly captioned as such. It contains no model
 * output, no vendor name, no latency figure and no agreement count, because
 * none of those were measured — inventing them on a marketing page would break
 * the same rule the product is built around. What it shows is the *shape* of
 * the interface: a synthesis in the reading column, a provenance rail in the
 * gutter, and a metadata line in the machine register.
 */

/** Neutral placeholders. Position identifies a model; never a vendor colour. */
const RAIL = [
  { density: 1, diverges: false },
  { density: 0.75, diverges: false },
  { density: 0.5, diverges: true },
  { density: 0.25, diverges: false },
] as const;

const LINES = ['92%', '86%', '97%', '64%'] as const;

export function ProductPreview() {
  return (
    <figure className="m-0">
      <div className="overflow-hidden border border-line bg-canvas">
        {/* Window chrome, reduced to a single title row. */}
        <div className="flex h-9 items-center gap-2 border-b border-line bg-workspace px-3">
          <span data-register="machine" className="text-note uppercase text-ink-3">
            Conversation
          </span>
        </div>

        <div className="flex gap-4 p-5 md:p-7">
          <div className="flex w-full flex-col gap-6">
            {/* Prompt */}
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-control bg-raised px-3 py-2 text-ui text-ink-2">
                How should we handle writes that span two services?
              </div>
            </div>

            {/* Answer: rail in the gutter, synthesis in the column. */}
            <div className="flex gap-5">
              <ul aria-hidden="true" className="flex w-0.5 shrink-0 flex-col gap-px self-stretch">
                {RAIL.map((segment, index) => (
                  <li key={index} className="min-h-0 w-full flex-1">
                    <span
                      className={clsx(
                        'block size-full bg-line-strong',
                        segment.diverges &&
                          '[mask-image:linear-gradient(to_bottom,#000_0_calc(50%-1px),transparent_calc(50%-1px)_calc(50%+1px),#000_calc(50%+1px)_100%)]',
                      )}
                      style={{ opacity: segment.density }}
                    />
                  </li>
                ))}
              </ul>

              <div className="min-w-0 flex-1">
                <div aria-hidden="true" className="flex flex-col gap-2.5">
                  {LINES.map((width) => (
                    <span key={width} className="block h-2 bg-hover" style={{ width }} />
                  ))}
                </div>

                <p
                  data-register="machine"
                  aria-hidden="true"
                  className="mt-5 text-meta text-ink-3"
                >
                  FOUR MODELS · THREE CONCUR · ONE DIVERGES
                </p>

                <div aria-hidden="true" className="mt-4 flex items-center gap-2">
                  <span className="h-px w-4 bg-line-subtle" />
                  <span data-register="machine" className="text-note uppercase text-ink-3">
                    Comparison
                  </span>
                  <span className="h-px flex-1 bg-line-subtle" />
                </div>
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
