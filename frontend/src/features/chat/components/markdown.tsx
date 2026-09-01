import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

/** Only these schemes render as links. Everything else renders as literal text. */
const SAFE_SCHEME = /^(https?:|mailto:)/i;

/**
 * Model output is untrusted input. It renders to a React element tree — there
 * is no dangerouslySetInnerHTML anywhere in this codebase — and raw HTML in the
 * source is not parsed at all, so a <script> in a response is literal text.
 */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            if (!href || !SAFE_SCHEME.test(href)) return <>{children}</>;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" {...props}>
                {children}
              </a>
            );
          },

          pre({ children }) {
            return <>{children}</>;
          },

          code({ className, children, ...props }) {
            const fenced = /language-(\w+)/.exec(className ?? '');
            const text = String(children).replace(/\n$/, '');
            // react-markdown gives no `inline` flag in v9; a fenced block is the
            // one that carries a language class or contains a newline.
            if (!fenced && !text.includes('\n')) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock language={fenced?.[1] ?? null} code={text} />;
          },

          table({ children }) {
            return (
              <div className="mb-4 overflow-x-auto">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
