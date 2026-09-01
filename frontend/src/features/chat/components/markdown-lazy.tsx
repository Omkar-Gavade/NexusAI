import { lazy, Suspense } from 'react';

/**
 * The unified/remark ecosystem is ~160KB of the dependency graph and is not
 * needed until an answer exists. It is deferred out of the entry chunk and
 * warmed by `prefetchMarkdown` when a conversation route mounts, so the
 * download overlaps latency the user is already waiting through rather than
 * delaying the first token.
 */
const Markdown = lazy(() => import('./markdown'));

export function prefetchMarkdown(): void {
  void import('./markdown');
}

export function LazyMarkdown({ content }: { content: string }) {
  return (
    <Suspense fallback={<pre className="md whitespace-pre-wrap font-human">{content}</pre>}>
      <Markdown content={content} />
    </Suspense>
  );
}
