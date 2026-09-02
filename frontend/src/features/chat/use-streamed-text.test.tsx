import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamedText } from './use-streamed-text';

/**
 * The throttle exists for cost, so the tests are about the guarantee that makes
 * it safe: it may delay a frame, it may never lose a character.
 */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useStreamedText', () => {
  it('returns the exact final text the moment streaming stops', () => {
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useStreamedText(text, streaming),
      { initialProps: { text: 'partial', streaming: true } },
    );

    // Mid-stream the value may lag behind.
    rerender({ text: 'partial answer that is still arriving', streaming: true });

    // The instant it settles, the full string is returned with no tick needed.
    rerender({ text: 'partial answer that is still arriving', streaming: false });
    expect(result.current).toBe('partial answer that is still arriving');
  });

  it('never truncates, however the deltas are spaced', () => {
    const chunks = ['a', 'ab', 'abc', 'abcd', 'abcde'];
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useStreamedText(text, streaming),
      { initialProps: { text: chunks[0]!, streaming: true } },
    );

    for (const text of chunks) {
      rerender({ text, streaming: true });
      act(() => void vi.advanceTimersByTime(10));
    }

    rerender({ text: 'abcde', streaming: false });
    expect(result.current).toBe('abcde');
  });

  it('catches up while still streaming rather than freezing', () => {
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useStreamedText(text, streaming),
      { initialProps: { text: '', streaming: true } },
    );

    rerender({ text: 'first', streaming: true });
    act(() => void vi.advanceTimersByTime(120));
    expect(result.current).toBe('first');

    // Word-aligned: "second" has no boundary after it yet, so it is published
    // on the next tick or by the exact-text path at completion. Nothing is
    // delayed — the withheld fragment is only what arrived since the last tick.
    rerender({ text: 'first second', streaming: true });
    act(() => void vi.advanceTimersByTime(120));
    expect(result.current).toBe('first ');

    rerender({ text: 'first second third', streaming: true });
    act(() => void vi.advanceTimersByTime(120));
    expect(result.current).toBe('first second ');
  });

  it('rebuilds far less often than the delta rate', () => {
    // 60 deltas inside one throttle window must not become 60 parses.
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useStreamedText(text, streaming),
      { initialProps: { text: '', streaming: true } },
    );

    const seen = new Set<string>();
    for (let i = 1; i <= 60; i++) {
      rerender({ text: 'x'.repeat(i), streaming: true });
      act(() => void vi.advanceTimersByTime(16));
      seen.add(result.current);
    }

    // ~60 frames over ~960ms is at most ten ticks, not sixty.
    expect(seen.size).toBeLessThanOrEqual(12);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('word-oriented release', () => {
  it('never shows a half-typed word mid-stream', () => {
    const { result } = renderHook(
      ({ text, streaming }) => useStreamedText(text, streaming),
      { initialProps: { text: 'The capital of Ja', streaming: true } },
    );
    act(() => void vi.advanceTimersByTime(120));
    expect(result.current).toBe('The capital of ');
    expect(result.current).not.toMatch(/Ja$/);
  });

  it('does not hold back the very first word waiting for a second', () => {
    const { result } = renderHook(() => useStreamedText('The', true));
    expect(result.current).toBe('The');
  });

  it('publishes the exact text the instant streaming stops, boundary or not', () => {
    // The guarantee that makes word alignment safe: completion bypasses it.
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useStreamedText(text, streaming),
      { initialProps: { text: 'Tokyo is the capital of Japa', streaming: true } },
    );
    act(() => void vi.advanceTimersByTime(120));
    expect(result.current).toBe('Tokyo is the capital of ');

    rerender({ text: 'Tokyo is the capital of Japan.', streaming: false });
    expect(result.current).toBe('Tokyo is the capital of Japan.');
  });

  it('loses nothing across fragmented provider deltas', () => {
    const fragments = ['The cap', 'ital of ', 'Japan ', 'is **To', 'kyo**.'];
    let acc = '';
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useStreamedText(text, streaming),
      { initialProps: { text: '', streaming: true } },
    );

    for (const f of fragments) {
      acc += f;
      rerender({ text: acc, streaming: true });
      act(() => void vi.advanceTimersByTime(120));
      // Whatever is on screen is always a prefix of what has arrived.
      expect(acc.startsWith(result.current)).toBe(true);
    }

    rerender({ text: acc, streaming: false });
    expect(result.current).toBe('The capital of Japan is **Tokyo**.');
  });
});
