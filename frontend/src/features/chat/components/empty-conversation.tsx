import { Logo } from '@/components/ui/logo';

/**
 * The empty conversation.
 *
 * Positioned low in the thread rather than centred in it, so the eye lands here
 * and continues down to the composer, which is the actual next action. A
 * centred block treats the empty state as the destination.
 *
 * No suggestion wall, no illustration, no hero. Someone who has signed in and
 * opened a conversation has already been sold; a workspace that re-pitches
 * itself every time it is empty reads as a landing page that failed to log you
 * in. What this space owes the reader is that the product is ready — and, when
 * it is not, why.
 */
export function EmptyConversation({ disabled }: { disabled: boolean }) {
  return (
    <div className="flex min-h-[46vh] flex-col justify-end pb-2">
      <Logo size={22} className="mb-4 text-ink-3" aria-hidden="true" />

      <h2 className="text-section font-[550] tracking-[-0.01em] text-ink">
        What can I help you with?
      </h2>

      {/*
        Both modes, because the composer offers both. Saying only "several
        models" described the product as it behaves in synthesis mode and
        misdescribed it the moment a reader picked a single model from the
        selector — the answer then comes from that model alone.
      */}
      <p className="mt-2 max-w-[52ch] text-body text-ink-2">
        Ask anything. Pick one model to answer directly, or send the question to several and
        get their responses reconciled into one answer.
      </p>

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
