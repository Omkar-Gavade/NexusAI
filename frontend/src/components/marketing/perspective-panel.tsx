import clsx from 'clsx';

/**
 * Three models, one question, three different readings of it.
 *
 * The cards carry no factual claims. Writing plausible-looking model answers on
 * a marketing page would be inventing the exact thing the product refuses to
 * invent, and a reader cannot tell a fabricated answer from a real one. What is
 * shown instead is the *shape* of divergence: each model took a reading, the
 * readings differ, and the difference is visible rather than resolved offstage.
 */

const READINGS = [
  {
    id: 'model-a',
    reading: 'Reading one',
    note: 'Answers the most common interpretation of the question.',
    diverges: false,
    widths: ['100%', '84%', '58%'],
  },
  {
    id: 'model-b',
    reading: 'Reading two',
    note: 'Takes the question a different way, and answers that instead.',
    diverges: true,
    widths: ['92%', '100%', '46%'],
  },
  {
    id: 'model-c',
    reading: 'Reading one',
    note: 'Reaches the same conclusion as the first, by a different route.',
    diverges: false,
    widths: ['100%', '70%'],
  },
] as const;

export function PerspectivePanel() {
  return (
    <figure className="m-0">
      <p className="sr-only">
        An illustration of three models answering the same question. Two take one reading of
        it and one takes a different reading, so their responses are not interchangeable.
      </p>

      <div aria-hidden="true" className="grid gap-3 md:grid-cols-3">
        {READINGS.map((model) => (
          <div key={model.id} className="flex flex-col border border-line bg-canvas">
            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-2.5">
              <span data-register="machine" className="text-note text-ink-2">
                {model.id}
              </span>
              <span data-register="machine" className="text-note uppercase text-ink-3">
                {model.reading}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-col gap-1.5">
                {model.widths.map((width, index) => (
                  <span key={index} className="block h-1.5 bg-hover" style={{ width }} />
                ))}
              </div>

              <p className="text-ui text-ink-2">{model.note}</p>

              <span
                className={clsx(
                  'mt-auto block h-0.5 w-full',
                  model.diverges
                    ? 'bg-line-strong [mask-image:linear-gradient(to_right,#000_0_calc(50%-2px),transparent_calc(50%-2px)_calc(50%+2px),#000_calc(50%+2px)_100%)]'
                    : 'bg-line-strong',
                )}
              />
            </div>
          </div>
        ))}
      </div>

      <figcaption className="mt-3 text-micro text-ink-3">
        Illustration of divergent readings. Static — not live model output.
      </figcaption>
    </figure>
  );
}
