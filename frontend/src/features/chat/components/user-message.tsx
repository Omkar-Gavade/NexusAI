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
      <div className="max-w-[min(85%,36rem)] rounded-[18px] rounded-br-md border border-accent/15 bg-accent-quiet px-4 py-2.5 text-body whitespace-pre-wrap text-ink shadow-float max-lg:max-w-[90%]">
        {content}
      </div>
    </div>
  );
}
