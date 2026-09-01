/**
 * Visually distinct but quiet: a raised fill and a 5px radius, right-aligned.
 * Not a large bubble — the prompt is context for the answer, not the subject.
 */
export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-control bg-raised px-3.5 py-2.5 text-body whitespace-pre-wrap max-lg:max-w-[90%]">
        {content}
      </div>
    </div>
  );
}
