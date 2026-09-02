/**
 * Visually distinct but quiet: a raised fill and a 5px radius, right-aligned.
 * Not a large bubble — the prompt is context for the answer, not the subject.
 *
 * Capped in absolute terms as well as proportionally. The conversation column
 * is wider than the reading measure so the two speakers sit on different axes;
 * 85% of that column would be a 900px bubble, which is neither compact nor
 * readable.
 */
export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[min(85%,34rem)] rounded-control bg-raised px-3.5 py-2.5 text-body whitespace-pre-wrap max-lg:max-w-[90%]">
        {content}
      </div>
    </div>
  );
}
