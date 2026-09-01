import { Rule } from '@/components/ui/rule';

/**
 * Explains what belongs here and offers one way in. No illustration, no logo,
 * no oversized icon — the composer is the call to action, and a button pointing
 * at it would be redundant.
 */
const SUGGESTIONS = [
  'Compare two approaches to a problem I describe',
  'Review this code for correctness and edge cases',
  'Explain a system design trade-off in depth',
  'Analyse an argument and tell me where it is weak',
] as const;

export function EmptyConversation({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="pt-[6vh]">
      <Rule label="NEW CONVERSATION" />

      <p className="mt-5 text-body text-ink">Ask a question, or paste something to analyse.</p>
      <p className="mt-2 max-w-[52ch] text-ui text-ink-2">
        NexusAI selects the models, reconciles their answers, and shows you where they disagree.
      </p>

      {!disabled && (
        <ul className="mt-6 flex flex-col gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                // Populates the composer rather than sending: the user must be
                // able to edit before committing to a generation.
                onClick={() => onPick(suggestion)}
                className="flex min-h-11 w-full items-center rounded-control border border-line px-3 text-left text-ui text-ink-2 transition-colors duration-(--duration-instant) hover:border-line-control hover:bg-hover hover:text-ink"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
