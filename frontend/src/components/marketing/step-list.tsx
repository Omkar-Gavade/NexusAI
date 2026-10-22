import { HUES, type Hue } from './spectrum';

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
 * already say. Each stage takes the next hue in the spectrum, and the rail
 * blends from one to the next.
 */
const STEP_HUES: readonly Hue[] = [
  HUES.indigo,
  HUES.violet,
  HUES.fuchsia,
  HUES.rose,
  HUES.amber,
  HUES.emerald,
];

function stepHue(index: number): Hue {
  return STEP_HUES[index % STEP_HUES.length] ?? HUES.indigo;
}

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
                className="absolute bottom-1 left-[15px] top-9 w-0.5 rounded-full opacity-60"
                style={{
                  backgroundImage: `linear-gradient(${stepHue(index).solid}, ${stepHue(index + 1).solid})`,
                }}
              />
            )}

            <span
              data-register="machine"
              aria-hidden="true"
              className="relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
              style={{
                backgroundImage: stepHue(index).gradient,
                boxShadow: `0 6px 18px -6px rgb(${stepHue(index).rgb} / 0.8)`,
              }}
            >
              {String(index + 1).padStart(2, '0')}
            </span>

            <div className="min-w-0 pt-0.5">
              <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{step.title}</h3>
              <p className="mt-1.5 max-w-[52ch] text-ui text-ink-2">{step.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
