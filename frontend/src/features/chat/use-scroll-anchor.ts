import { useCallback, useEffect, useRef, useState } from 'react';

/** Within this distance of the bottom, the view keeps following new content. */
const FOLLOW_THRESHOLD = 64;

/**
 * Auto-follow that yields to the reader.
 *
 * The view sticks to the bottom only while the user is already there. The
 * moment they scroll up to read something, following stops — being yanked away
 * from text you are reading is the worst bug a streaming UI can have.
 */
export function useScrollAnchor(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const distanceFromBottom = (node: HTMLDivElement) =>
    node.scrollHeight - node.scrollTop - node.clientHeight;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onScroll = () => setAtBottom(distanceFromBottom(node) < FOLLOW_THRESHOLD);
    node.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => node.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (node && atBottom) node.scrollTop = node.scrollHeight;
  }, [dependency, atBottom]);

  const jumpToLatest = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    setAtBottom(true);
  }, []);

  return { ref, atBottom, jumpToLatest };
}
