import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { agreementSentence } from '@/lib/format';

/**
 * The product's one decision, shown as the two shapes it produces.
 *
 * Everything else on this page explains a mechanism. This explains the choice,
 * and it is the only section a visitor has to understand: a question either
 * goes to one model and comes back as that model's answer, or it goes to
 * several and comes back reconciled. Both are supported, neither is presented
 * as the lesser one — pinning a model is the right call for work you were not
 * going to check, and saying so is what makes the synthesis claim credible.
 *
 * Drawn as two columns of the same construction so the difference reads as
 * structural rather than as emphasis: same selector row, same divider, same
 * result line. What changes between them is the number of model rows and the
 * sentence underneath, which is exactly what changes in the product.
 *
 * Model names are the catalog's. No latency, no quality ranking, no
 * availability: this page has no session and cannot know any of it.
 *
 * The two result lines are assembled the way `answer-block.tsx` assembles its
 * metadata row — the chosen model's display name then ANSWERED DIRECTLY, or
 * the application's own `agreementSentence()` then SYNTHESISED. Writing those
 * strings out by hand is how a marketing page ends up printing a shape the
 * workspace would never render.
 */

/** The illustrated synthesis turn: three asked, two answered, both concurred. */
const ILLUSTRATED = { requested: 3, responded: 2, concur: 2, diverge: 0 } as const;

/** The bar the selector renders in the composer, at rest. */
function SelectorRow({ value }: { value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle pb-3">
      <span data-register="machine" className="text-note uppercase text-ink-3">
        Response mode
      </span>
      <span className="text-ui font-[550] text-ink">{value}</span>
    </div>
  );
}

function ModelRow({
  name,
  outcome,
}: {
  name: string;
  outcome: 'responded' | 'failed';
}) {
  const failed = outcome === 'failed';

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      {/* The mark carries the outcome; the muted name repeats it, so the row
          does not depend on a reader distinguishing two small glyphs. */}
      {failed ? (
        <X size={13} aria-hidden="true" className="shrink-0 text-ink-3" />
      ) : (
        <Check size={13} aria-hidden="true" className="shrink-0 text-accent" />
      )}
      <span className={clsx('text-ui', failed ? 'text-ink-3 line-through' : 'text-ink-2')}>
        {name}
      </span>
      {failed && (
        <span data-register="machine" className="ml-auto text-note uppercase text-ink-3">
          No response
        </span>
      )}
    </li>
  );
}

/** The line the answer's metadata row prints when the turn is done. */
function Result({ value }: { value: string }) {
  return (
    <p
      data-register="machine"
      className="mt-4 border-t border-line-subtle pt-4 text-note uppercase text-ink-2"
    >
      {value}
    </p>
  );
}

function Mode({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col bg-canvas p-6 md:p-7">
      <span data-register="machine" className="text-note uppercase text-ink-3">
        {eyebrow}
      </span>
      <h3 className="mt-3 text-title font-[550] text-ink">{title}</h3>
      <p className="mt-2 max-w-[42ch] text-ui text-ink-2">{body}</p>

      <div className="mt-7">{children}</div>
    </div>
  );
}

export function ResponseModes() {
  return (
    <div className="grid gap-px border border-line bg-line md:grid-cols-2">
      <Mode
        eyebrow="Direct"
        title="Pick a model. It answers you."
        body="The response is that model's, unedited. Nothing reconciles it and nothing rewrites it, because nothing else ran."
      >
        <SelectorRow value="GPT-OSS 120B" />
        <ul className="mt-3">
          <ModelRow name="GPT-OSS 120B" outcome="responded" />
        </ul>
        <Result value="GPT-OSS 120B · ANSWERED DIRECTLY" />
      </Mode>

      <Mode
        eyebrow="Synthesis"
        title="Ask several. Read one answer."
        body="The question goes to every selected model at once. A synthesis pass reads the responses that came back and writes the single answer you read."
      >
        <SelectorRow value="Synthesis · 3 models" />
        <ul className="mt-3">
          <ModelRow name="Gemini 2.5 Flash" outcome="responded" />
          <ModelRow name="GPT-OSS 120B" outcome="responded" />
          {/* A failure in the illustration, not a tidy three-of-three. A model
              that does not answer is the ordinary case, and the count below
              reports what actually ran rather than what was asked for. */}
          <ModelRow name="Mistral Large" outcome="failed" />
        </ul>
        <Result value={`${agreementSentence(ILLUSTRATED)} · SYNTHESISED`} />
      </Mode>
    </div>
  );
}
