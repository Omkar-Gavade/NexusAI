import clsx from 'clsx';
import { Check, Columns2, Layers, Sparkles, X } from 'lucide-react';
import { agreementSentence } from '@/lib/format';
import { HUES, modelHue, type Hue } from './spectrum';

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
  id,
  name,
  outcome,
}: {
  id: string;
  name: string;
  outcome: 'responded' | 'failed';
}) {
  const failed = outcome === 'failed';
  const hue = modelHue(id);

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      {/* The model's hue identifies it; the mark carries the outcome, and the
          muted name repeats it, so nothing depends on colour alone. */}
      <span
        aria-hidden="true"
        className={clsx('size-2 shrink-0 rounded-full', failed && 'opacity-35')}
        style={{ backgroundImage: hue.gradient }}
      />
      {failed ? (
        <X size={13} aria-hidden="true" className="shrink-0 text-ink-3" />
      ) : (
        <Check size={13} aria-hidden="true" className="shrink-0 text-ok" />
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
function Result({ value, hue }: { value: string; hue: Hue }) {
  return (
    <p
      data-register="machine"
      className="mt-5 rounded-control px-3 py-2 text-note uppercase text-ink"
      style={{ backgroundColor: `rgb(${hue.rgb} / 0.14)`, boxShadow: `inset 0 0 0 1px rgb(${hue.rgb} / 0.35)` }}
    >
      {value}
    </p>
  );
}

function Mode({
  eyebrow,
  title,
  body,
  hue,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  hue: Hue;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col bg-canvas p-6 md:p-7">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: hue.gradient }} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 right-0 size-56 rounded-full opacity-60"
        style={{ backgroundImage: `radial-gradient(closest-side, rgb(${hue.rgb} / 0.22), transparent)` }}
      />
      <div className="relative flex items-center gap-3">
        <span
          className="grid size-9 place-items-center rounded-[10px] text-white"
          style={{ backgroundImage: hue.gradient, boxShadow: `0 8px 20px -8px rgb(${hue.rgb} / 0.8)` }}
        >
          {icon}
        </span>
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          {eyebrow}
        </span>
      </div>
      <h3 className="relative mt-4 text-[19px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      <p className="mt-2 max-w-[42ch] text-ui text-ink-2">{body}</p>

      <div className="mt-7">{children}</div>
    </div>
  );
}

export function ResponseModes() {
  return (
    <div className="grid gap-px overflow-hidden rounded-overlay border border-line bg-line lg:grid-cols-3">
      <Mode
        hue={HUES.indigo}
        icon={<Sparkles size={16} aria-hidden="true" />}
        eyebrow="Direct · Smart Router"
        title="Pick a model, or let Smart Routing choose."
        body="Auto-selects the best fit for your task (coding, research, reasoning, or quick questions), or lets you pin a specific model. The response is that model's, unedited. Nothing reconciles it and nothing rewrites it, because nothing else ran."
      >
        <SelectorRow value="GPT-OSS 120B" />
        <ul className="mt-3">
          <ModelRow id="llama-groq" name="GPT-OSS 120B" outcome="responded" />
        </ul>
        <Result hue={HUES.indigo} value="GPT-OSS 120B · ANSWERED DIRECTLY" />
      </Mode>

      <Mode
        hue={HUES.fuchsia}
        icon={<Columns2 size={16} aria-hidden="true" />}
        eyebrow="Compare · Model Arena"
        title="Compare side by side. Choose or combine."
        body="Send one prompt to two or more models concurrently. Inspect each response in its own panel, select the answer you prefer to carry into follow-up questions, or combine completed answers on demand."
      >
        <SelectorRow value="Compare · 3 models" />
        <ul className="mt-3">
          <ModelRow id="gemini-flash" name="Gemini 2.5 Flash" outcome="responded" />
          <ModelRow id="llama-groq" name="GPT-OSS 120B" outcome="responded" />
          <ModelRow id="gpt-4o" name="GPT-4o" outcome="responded" />
        </ul>
        <Result hue={HUES.fuchsia} value="MODEL ARENA · SELECT PREFERRED OR COMBINE" />
      </Mode>

      <Mode
        hue={HUES.violet}
        icon={<Layers size={16} aria-hidden="true" />}
        eyebrow="Synthesis"
        title="Ask several. Read one answer."
        body="The question goes to every selected model at once. A synthesis pass reads the responses that came back and writes the single answer you read."
      >
        <SelectorRow value="Synthesis · 3 models" />
        <ul className="mt-3">
          <ModelRow id="gemini-flash" name="Gemini 2.5 Flash" outcome="responded" />
          <ModelRow id="llama-groq" name="GPT-OSS 120B" outcome="responded" />
          {/* A failure in the illustration, not a tidy three-of-three. A model
              that does not answer is the ordinary case, and the count below
              reports what actually ran rather than what was asked for. */}
          <ModelRow id="mistral-large" name="Mistral Medium" outcome="failed" />
        </ul>
        <Result hue={HUES.violet} value={`${agreementSentence(ILLUSTRATED)} · SYNTHESISED`} />
      </Mode>
    </div>
  );
}
