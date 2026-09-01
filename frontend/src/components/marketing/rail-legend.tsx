import clsx from 'clsx';

/**
 * The provenance rail's encoding, shown at the size it actually renders.
 *
 * The rail is two pixels wide in the product, and describing it in prose asks
 * the reader to imagine something they have never seen. Drawing it — with the
 * same segment geometry, the same break-for-divergence, and no colour carrying
 * meaning — teaches the notation before they meet it.
 */

const STATES = [
  {
    state: 'responded' as const,
    title: 'Responded',
    body: 'A solid segment. The model answered and its response is one gesture away.',
  },
  {
    state: 'diverged' as const,
    title: 'Diverged',
    body: 'A break in the segment. That model reached a different conclusion from the synthesis.',
  },
  {
    state: 'failed' as const,
    title: 'Did not respond',
    body: 'A hollow segment. The model was asked and did not answer, and the answer says so.',
  },
];

function Segment({ state }: { state: (typeof STATES)[number]['state'] }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'block h-14 w-0.5 shrink-0',
        state === 'responded' && 'bg-line-strong',
        state === 'diverged' &&
          'bg-line-strong [mask-image:linear-gradient(to_bottom,#000_0_calc(50%-2px),transparent_calc(50%-2px)_calc(50%+2px),#000_calc(50%+2px)_100%)]',
        state === 'failed' && 'bg-line',
      )}
    />
  );
}

export function RailLegend() {
  return (
    <ul className="grid gap-x-10 gap-y-6 md:grid-cols-3">
      {STATES.map(({ state, title, body }) => (
        <li key={state} className="flex gap-4">
          <Segment state={state} />
          <div>
            <h3 className="text-title font-[550] text-ink">{title}</h3>
            <p className="mt-1.5 max-w-[34ch] text-ui text-ink-2">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
