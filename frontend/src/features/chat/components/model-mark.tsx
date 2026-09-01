/**
 * Five neutral glyphs, assigned by position in the plan. Used only in the
 * comparison view where several models sit adjacent and position alone is not
 * enough. Never a vendor logo, never a vendor colour.
 */
const MARKS = [
  <rect key="0" x="2.5" y="2.5" width="9" height="9" />,
  <path key="1" d="M7 1.5 12.5 7 7 12.5 1.5 7Z" />,
  <path key="2" d="M3 1.5 12 7 3 12.5Z" />,
  <rect key="3" x="2.5" y="2.5" width="9" height="9" rx="4.5" />,
  <path key="4" d="M7 1.5 12 4.5v5L7 12.5 2 9.5v-5Z" />,
];

export function ModelMark({ index }: { index: number }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="shrink-0 fill-none stroke-ink-3 [stroke-width:1.3]"
    >
      {MARKS[index % MARKS.length]}
    </svg>
  );
}
