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

export function EmptyConversation({ disabled }: { disabled: boolean }) {
  return (
    <div className="flex min-h-[46vh] flex-col justify-end pb-2">
      <Logo size={22} className="mb-4 text-ink-3" aria-hidden="true" />

      <h2 className="text-section font-[550] tracking-[-0.01em] text-ink">Ask anything.</h2>

      {/*
        Both modes, because the composer offers both. Saying only "several
        models" described the product as it behaves in synthesis mode and
        misdescribed it the moment a reader picked a single model from the
        selector — the answer then comes from that model alone.
      */}
      <p className="mt-2 max-w-[52ch] text-body text-ink-2">
        Choose a model for a direct answer, or use Synthesis to put the question to several and
        read one reconciled answer.
      </p>

      {!disabled && (
        <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2">
          {EXAMPLES.map((example) => (
            <li key={example} data-register="machine" className="text-meta text-ink-3">
              {example}
            </li>
          ))}
        </ul>
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
