import type { Source } from '@nexusai/contracts';
import { ExternalLink } from 'lucide-react';

/**
 * Evidence, not decoration. No favicons, no thumbnails, no coloured domain
 * chips — a favicon row is a colour system the product does not control, and it
 * turns citations into logos.
 *
 * Only fields the backend actually returned are rendered. Nothing here is
 * inferred or filled in.
 */
export function SourceList({ sources, idPrefix }: { sources: Source[]; idPrefix: string }) {
  return (
    <ol className="flex flex-col gap-2">
      {sources.map((source) => (
        <li key={source.index} id={`${idPrefix}-${source.index}`}>
          <SourceCard source={source} />
        </li>
      ))}
    </ol>
  );
}

function SourceCard({ source }: { source: Source }) {
  const safe = /^https?:/i.test(source.url);

  return (
    <article className="flex gap-2.5 border border-line-subtle bg-raised p-3">
      <span
        data-register="machine"
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-meta text-ink-3"
      >
        [{source.index}]
      </span>

      <div className="min-w-0 flex-1">
        <h4 className="truncate text-ui font-[550] text-ink">
          {safe ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 hover:underline"
            >
              <span className="truncate">{source.title}</span>
              <ExternalLink size={11} aria-hidden="true" className="shrink-0 text-ink-3" />
            </a>
          ) : (
            source.title
          )}
        </h4>

        <p data-register="machine" className="mt-0.5 truncate text-meta text-ink-3">
          {source.domain}
          {source.retrievedAt && ` · ${new Date(source.retrievedAt).toLocaleDateString()}`}
        </p>

        {source.snippet && (
          <p className="mt-1.5 line-clamp-2 text-micro text-ink-2">{source.snippet}</p>
        )}
      </div>
    </article>
  );
}
