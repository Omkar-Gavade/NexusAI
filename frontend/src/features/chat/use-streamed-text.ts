import { useEffect, useRef, useState } from 'react';

/** How often the markdown tree is rebuilt while text is still arriving. */
const REPARSE_INTERVAL_MS = 100;

/**
 * Throttles the text handed to the markdown renderer *while streaming only*.
 *
 * Deltas are already batched onto `requestAnimationFrame`, so `text` changes at
 * most once a frame. That is the right cadence for a string; it is the wrong
 * one for re-parsing Markdown. Measured on a ~3.9k-character answer, one parse
 * costs about 13ms on average and 21ms at worst — more than a frame's budget,
 * so a long answer asks the renderer to do work it cannot finish before the
 * next delta arrives, and streaming degrades exactly when the answer is
 * substantial enough to matter.
 *
 * Rebuilding ten times a second instead of sixty cuts that by six. It stays
 * below the granularity at which reading feels chunky, so the text still
 * appears to flow — the throttle is on the parse, not on the arrival.
 *
 * The important guarantee: once streaming stops this returns `text` directly,
 * never a stale snapshot. The finished answer is always complete and exact, so
 * a dropped timer can delay a frame but can never truncate a response.
 */
/**
 * The text up to the last completed word.
 *
 * Providers do not break on word boundaries — a delta routinely ends mid-word
 * — so rendering the raw buffer shows "the capital of Ja" for a frame before it
 * becomes "Japan". Publishing to the last boundary instead makes the answer
 * arrive a word at a time, which is what reading it feels like.
 *
 * This is not a typing effect and it delays nothing: the withheld fragment is
 * whatever arrived since the previous tick, and it is published on the next one
 * — or immediately, by the exact-text path, when the stream ends. If nothing
 * has completed yet the whole buffer is returned, so the first word is never
 * held back waiting for a second.
 */
function toWordBoundary(text: string): string {
  const lastSpace = text.search(/\s\S*$/);
  return lastSpace > 0 ? text.slice(0, lastSpace + 1) : text;
}

export function useStreamedText(text: string, streaming: boolean): string {
  const [shown, setShown] = useState(text);
  const latest = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  latest.current = text;

  useEffect(() => {
    if (!streaming) {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      return;
    }

    // One timer in flight at a time: later deltas ride the pending tick rather
    // than each scheduling their own.
    if (timer.current !== null) return;

    timer.current = setTimeout(() => {
      timer.current = null;
      setShown(latest.current);
    }, REPARSE_INTERVAL_MS);
  }, [text, streaming]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  // Exact and complete the moment streaming stops; word-aligned before that.
  return streaming ? toWordBoundary(shown) : text;
}
