import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Dialog } from '@/components/ui/dialog';
import { timestamp } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useConversations } from '@/features/conversations/use-conversations';

/**
 * Filters the already-cached conversation list in the client. A round trip per
 * keystroke would be slower for a few hundred titles and would put the user's
 * typing into server logs.
 *
 * Deliberately not a command palette: this searches conversations, and adding
 * commands to it would make it a second navigation system.
 */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data, isPending, isError } = useConversations();

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after the dialog is in the top layer.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = data?.conversations ?? [];
    if (!needle) return all.slice(0, 8);
    return all.filter((c) => c.title.toLowerCase().includes(needle)).slice(0, 20);
  }, [data, query]);

  const openResult = (index: number) => {
    const conversation = results[index];
    if (!conversation) return;
    navigate(routes.conversation(conversation.id));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Search conversations"
      description="Matches conversation titles you have loaded. Message text is not searched.">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <Search size={15} aria-hidden="true" className="shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          value={query}
          role="combobox"
          aria-expanded
          aria-controls="search-results"
          aria-activedescendant={results[active] ? `search-result-${active}` : undefined}
          aria-label="Search conversation titles"
          placeholder="Search titles…"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              openResult(active);
            }
          }}
          className="w-full bg-transparent text-ui text-ink outline-none placeholder:text-ink-off"
        />
      </div>

      <div id="search-results" role="listbox" aria-label="Results" className="mt-2 max-h-[50dvh] overflow-y-auto">
        {isPending && <p className="p-3 text-micro text-ink-3">Loading conversations…</p>}

        {isError && (
          <p className="p-3 text-micro text-ink-3">
            Conversations couldn&apos;t be loaded, so search is unavailable right now.
          </p>
        )}

        {data && results.length === 0 && (
          <p className="p-3 text-micro text-ink-3">
            {query.trim()
              ? `No loaded conversation title matches "${query.trim()}".`
              : 'Conversations you start will be searchable here.'}
          </p>
        )}

        {results.map((conversation, index) => (
          // A real button: native activation, and focus stays on the combobox
          // while aria-activedescendant tracks which result is current.
          <button
            key={conversation.id}
            type="button"
            id={`search-result-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === active}
            onPointerEnter={() => setActive(index)}
            onClick={() => openResult(index)}
            className={clsx(
              'flex w-full items-center gap-3 rounded-control px-2 py-2 text-left max-md:min-h-11',
              index === active && 'bg-hover',
            )}
          >
            <span className="min-w-0 flex-1 truncate text-ui text-ink">{conversation.title}</span>
            <span data-register="machine" className="shrink-0 text-meta text-ink-3">
              {timestamp(conversation.updatedAt)}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
