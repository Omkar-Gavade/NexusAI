import { Logo } from '@/components/ui/logo';

/**
 * The empty conversation.
 *
 * Positioned low in the thread rather than centred in it, so the eye lands here
 * and continues down to the composer, which is the actual next action. A
 * centred block treats the empty state as the destination.
 *
 * No suggestion wall, no illustration, no hero, and not "How can I help you
 * today?" — someone who has signed in and opened a conversation has already
 * been sold; a workspace that re-pitches itself every time it is empty reads as
 * a landing page that failed to log you in. What this space owes the reader is
 * the one thing that is not obvious from looking at the composer — that the
 * question can go to one model or to several — and, when nothing can answer,
 * why.
 */

/*
 * What the product is for, as four categories rather than four prompts.
 *
 * They are deliberately not clickable. These are kinds of question, not
 * questions: putting "Review some code" into the composer and sending it
 * produces nothing useful, so a button here would be an affordance that
 * punishes the person who trusts it.
 *
 * "Analyse a document" is not among them. Attachments are `Planned` in the
 * capability matrix and there is no upload endpoint — the tray renders the
 * states the contract will produce and nothing more. Listing it would be
 * advertising a capability the product does not have.
 */
const EXAMPLES = [
  'Compare two technologies',
  'Review some code',
  'Explain a difficult concept',
  'Check an answer from more than one angle',
] as const;

/*
 * The four ways a question can travel, stated once, as a key rather than a
 * pitch. Machine register on the left because these are the names the
 * composer and every answer's routing line use.
 */
const MODES = [
  ['Smart route', 'the router picks a model for the task'],
  ['One model', 'that model answers alone, unedited'],
  ['Synthesis', 'several models, one reconciled answer'],
  ['Arena', 'two to four answers side by side'],
] as const;

export function EmptyConversation({ disabled }: { disabled: boolean }) {
  return (
    <div className="flex min-h-[46vh] flex-col justify-end pb-4 motion-safe:animate-[nx-answer-in_220ms_var(--ease-out)]">
      <Logo size={22} className="mb-5 text-accent" aria-hidden="true" />

      <h2 className="text-display font-[550] text-ink">Ask anything.</h2>

      {/*
        Every mode, because the composer offers every mode. Saying only
        "several models" misdescribed the product the moment a reader picked a
        single model — or compared answers in the Arena.
      */}
      <p className="mt-2 max-w-[56ch] text-body text-ink-2">
        Choose a model for a direct answer, let Smart Routing pick one, or put the question to
        several — reconciled into one synthesis, or compared side by side.
      </p>

      {!disabled && (
        <>
          <dl className="mt-7 grid max-w-[56ch] grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 border-t border-line-subtle pt-4">
            {MODES.map(([name, what]) => (
              <div key={name} className="contents">
                <dt data-register="machine" className="text-note uppercase leading-5 text-ink-2">
                  {name}
                </dt>
                <dd className="text-ui text-ink-3">{what}</dd>
              </div>
            ))}
          </dl>

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2" aria-label="Kinds of question">
            {EXAMPLES.map((example) => (
              <li key={example} data-register="machine" className="text-meta text-ink-3">
                {example}
              </li>
            ))}
          </ul>
        </>
      )}

      {disabled && (
        // Stated rather than left for the reader to discover by typing a
        // question and watching it fail. Never names a model: availability is
        // per deployment and the workspace reports it per model.
        <p className="mt-4 max-w-[52ch] text-ui text-ink-3">
          No models are currently available, so a question cannot be answered right now.
        </p>
      )}
    </div>
  );
}
