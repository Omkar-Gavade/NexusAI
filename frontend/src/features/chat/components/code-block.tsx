import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { copy } from '@/lib/clipboard';

/**
 * Radius 0: a code block is structure, not a control. Highlighting is applied
 * only once the block is complete — highlighting a partially streamed block
 * produces flickering garbage as the tokeniser re-guesses the grammar.
 */
export function CodeBlock({ language, code }: { language: string | null; code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!(await copy(code))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <figure className="mb-4 border border-line bg-raised">
      <figcaption className="flex h-8 items-center justify-between border-b border-line pl-3 pr-1">
        <span data-register="machine" className="text-note uppercase text-ink-3">
          {language ?? 'text'}
        </span>
        <IconButton
          size="sm"
          label={copied ? 'Copied' : 'Copy code'}
          icon={copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          onClick={onCopy}
        />
      </figcaption>

      <pre className="overflow-x-auto p-3 text-meta" translate="no">
        <code>{code}</code>
      </pre>

      {/* The copy result is announced rather than only shown on the icon. */}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </figure>
  );
}
