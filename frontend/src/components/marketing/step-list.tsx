/**
 * The pipeline as a connected progression, not a grid of numbered paragraphs.
 *
 * A two-column grid gave the last step an orphaned column and, worse, said
 * nothing about order — these stages happen one after another, and the rail
 * running through the numerals is what carries that. It is the same vertical
 * rail motif the provenance gutter uses, which is deliberate: the page should
 * be teaching that notation by the time the reader reaches the product.
 *
 * No icons. Five decorative glyphs would add nothing the numeral does not
 * already say.
 */
export function StepList({
  steps,
}: {
  steps: ReadonlyArray<{ title: string; body: string }>;
}) {
  return (
    <ol className="max-w-[64ch]">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;

        return (
          <li key={step.title} className="relative flex gap-5 pb-9 last:pb-0">
            {/* The rail. Stops at the final marker rather than trailing into
                whitespace, so the sequence reads as finished. */}
            {!last && (
              <span
                aria-hidden="true"
                className="absolute bottom-2 left-[13px] top-7 w-px bg-line"
              />
            )}

            <span
              data-register="machine"
              aria-hidden="true"
              className="relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center border border-line bg-canvas text-note text-ink-3"
            >
              {String(index + 1).padStart(2, '0')}
            </span>

            <div className="min-w-0 pt-0.5">
              <h3 className="text-title font-[550] text-ink">{step.title}</h3>
              <p className="mt-1.5 max-w-[52ch] text-ui text-ink-2">{step.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
