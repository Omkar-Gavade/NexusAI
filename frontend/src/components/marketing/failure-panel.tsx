import clsx from 'clsx';
import { agreementSentence } from '@/lib/format';

/**
 * What happens when a model does not answer.
 *
 * The interesting case for a multi-model product is not the happy path — it is
 * the turn where one provider is down. The tempting behaviour is to quietly
 * proceed with two responses and present the result as though three models had
 * agreed. This draws the alternative: the failed model keeps its place, the
 * count says two of three, and the reader can see which one is missing.
 *
 * The count is produced by the application's own formatter, so this panel
 * cannot claim something the workspace would not.
 */

const TURN = { requested: 3, responded: 2, concur: 2, diverge: 0 } as const;

const ROWS = [
  { id: 'model-a', ok: true, detail: '1.4 s · 312 tokens' },
  { id: 'model-b', ok: true, detail: '2.1 s · 287 tokens' },
  { id: 'model-c', ok: false, detail: 'Provider unavailable' },
] as const;

export function FailurePanel() {
  return (
    <figure className="m-0">
      <p className="sr-only">
        An illustration of a turn in which two of three models responded and the third was
        unavailable. The synthesis proceeds from the two responses that returned, and reports{' '}
        {agreementSentence(TURN).toLowerCase()}.
      </p>

      <div aria-hidden="true" className="border border-line bg-canvas">
        <ul className="divide-y divide-line-subtle">
          {ROWS.map((row) => (
            <li key={row.id} className="flex items-center gap-4 px-4 py-3.5">
              {/* Present-but-hollow, rather than absent: the gap is the point. */}
              <span
                className={clsx(
                  'block h-6 w-0.5 shrink-0',
                  row.ok ? 'bg-line-strong' : 'bg-line',
                )}
              />
              <span data-register="machine" className="w-24 shrink-0 text-note text-ink-2">
                {row.id}
              </span>
              <span
                data-register="machine"
                className={clsx('text-note uppercase', row.ok ? 'text-ink-2' : 'text-ink-3')}
              >
                {row.ok ? 'Responded' : 'Did not respond'}
              </span>
              <span
                data-register="machine"
                className="ml-auto hidden text-note text-ink-3 sm:block"
              >
                {row.detail}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-t border-line bg-workspace px-4 py-3.5">
          <p data-register="machine" className="text-meta text-ink-3">
            {agreementSentence(TURN)}
          </p>
          <p className="mt-2 max-w-[52ch] text-ui text-ink-2">
            The synthesis proceeds from the responses that actually returned, and the answer
            says how many there were.
          </p>
        </div>
      </div>

      <figcaption className="mt-3 text-micro text-ink-3">
        Illustration of a degraded turn. Static — not live model output.
      </figcaption>
    </figure>
  );
}
