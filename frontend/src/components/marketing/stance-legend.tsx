import clsx from 'clsx';
import { CircleHelp, GitFork, Handshake, type LucideIcon } from 'lucide-react';
import { HUES, type Hue } from './spectrum';

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
    Icon: Handshake as LucideIcon,
    hue: HUES.emerald as Hue,
    label: 'CONCURS',
    title: 'Agreement is counted',
    body: 'The synthesis judged this response consistent with the answer it wrote. Counted, not assumed from similarity or a majority.',
  },
  {
    key: 'diverges' as const,
    Icon: GitFork as LucideIcon,
    hue: HUES.amber as Hue,
    label: 'DIVERGES',
    title: 'Disagreement is kept',
    body: 'This response reached a different conclusion. The answer says so rather than quietly choosing a side.',
  },
  {
    key: 'unknown' as const,
    Icon: CircleHelp as LucideIcon,
    hue: HUES.blue as Hue,
    label: 'UNKNOWN',
    title: 'Unjudged stays unjudged',
    body: 'No stance was established — the model failed, or the synthesis did not classify it. It is never rounded up to agreement.',
  },
];

/*
 * The segment is the notation — whole, broken, or faint — exactly as the
 * workspace rail draws it. The hue is a second channel on top, never the only
 * one, so the legend still reads in greyscale.
 */
function Mark({ stance, hue }: { stance: (typeof STANCES)[number]['key']; hue: Hue }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundImage: `linear-gradient(to bottom, ${hue.solid}, rgb(${hue.rgb} / 0.35))` }}
      className={clsx(
        'block h-16 w-[3px] shrink-0 rounded-full',
        stance === 'unknown' && 'opacity-45',
        stance === 'diverges' &&
          '[mask-image:linear-gradient(to_bottom,#000_0_calc(50%-3px),transparent_calc(50%-3px)_calc(50%+3px),#000_calc(50%+3px)_100%)]',
      )}
    />
  );
}

export function StanceLegend() {
  return (
    <ul className="grid gap-x-10 gap-y-8">
      {STANCES.map(({ key, Icon, hue, label, title, body }) => (
        <li key={key} className="flex gap-4">
          <Mark stance={key} hue={hue} />
          <div className="min-w-0">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-[7px] text-white"
                style={{ backgroundImage: hue.gradient }}
              >
                <Icon size={13} />
              </span>
              <span data-register="machine" className="text-note uppercase text-ink-3">
                {label}
              </span>
            </span>
            <h3 className="mt-1.5 text-title font-[550] text-ink">{title}</h3>
            <p className="mt-1.5 max-w-[52ch] text-ui text-ink-2">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
