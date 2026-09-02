/**
 * The empty conversation.
 *
 * One line, positioned where the first answer will appear. No suggestion
 * buttons, no explanation of what the product does, no illustration: a person
 * who has signed in and opened a conversation has already been sold, and a
 * workspace that pitches itself every time it is empty reads as a landing page
 * that failed to log you in.
 *
 * The composer directly below is the call to action, so nothing here competes
 * with it. What this space is for is telling the reader the application is
 * ready — and, when it is not, why.
 */
export function EmptyConversation({ disabled }: { disabled: boolean }) {
  return (
    <div className="pt-[10vh]">
      <p className="text-section font-[550] tracking-[-0.01em] text-ink">
        What can I help you with?
      </p>

      {disabled && (
        // Stated plainly rather than left for the user to discover by typing a
        // question and watching it fail. Never claims which model is missing —
        // availability is per deployment and the workspace reports it per model.
        <p className="mt-3 max-w-[52ch] text-ui text-ink-2">
          No models are currently available. This deployment has no reachable provider
          configured, so a question cannot be answered right now.
        </p>
      )}
    </div>
  );
}
