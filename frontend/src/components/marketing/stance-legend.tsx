import clsx from 'clsx';

/**
 * The three things a model's contribution can be, drawn in the notation the
 * workspace uses.
 *
 * `unknown` is deliberately given equal weight to the other two. It is not a
 * degraded case or a rendering fallback: it is what the product reports when
 * the synthesis stage did not classify a model, and treating an unjudged model
 * as agreement is precisely the lie a multi-model product is tempted to tell.
 */

const STANCES = [
  {
    key: 'concurs' as const,
    label: 'CONCURS',
    title: 'Agreement is counted',
    body: 'The synthesis judged this response consistent with the answer it wrote. Counted, not assumed from similarity or a majority.',
  },
  {
    key: 'diverges' as const,
    label: 'DIVERGES',
    title: 'Disagreement is kept',
    body: 'This response reached a different conclusion. The answer says so rather than quietly choosing a side.',
  },
  {
    key: 'unknown' as const,
    label: 'UNKNOWN',
    title: 'Unjudged stays unjudged',
    body: 'No stance was established — the model failed, or the synthesis did not classify it. It is never rounded up to agreement.',
  },
];

function Mark({ stance }: { stance: (typeof STANCES)[number]['key'] }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'block h-16 w-0.5 shrink-0',
        stance === 'concurs' && 'bg-line-strong',
        stance === 'unknown' && 'bg-line',
        stance === 'diverges' &&
          'bg-line-strong [mask-image:linear-gradient(to_bottom,#000_0_calc(50%-3px),transparent_calc(50%-3px)_calc(50%+3px),#000_calc(50%+3px)_100%)]',
      )}
    />
  );
}

export function StanceLegend() {
  return (
    <ul className="grid gap-x-10 gap-y-8">
      {STANCES.map(({ key, label, title, body }) => (
        <li key={key} className="flex gap-4">
          <Mark stance={key} />
          <div className="min-w-0">
            <span data-register="machine" className="text-note uppercase text-ink-3">
              {label}
            </span>
            <h3 className="mt-1.5 text-title font-[550] text-ink">{title}</h3>
            <p className="mt-1.5 max-w-[52ch] text-ui text-ink-2">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
