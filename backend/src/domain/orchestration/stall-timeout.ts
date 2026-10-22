/**
 * A deadline on *silence*, not on duration, for a streamed model call.
 *
 * A total deadline was the wrong shape once every call streamed: a long answer
 * that was still arriving was cut off as TIMEOUT, discarding work the reader
 * was watching, while what the timeout exists to catch — a provider that has
 * stopped responding — is silence. So the timer restarts on every chunk, and
 * a separate hard ceiling still bounds the call however steadily it streams.
 */
export interface StallTimeout {
  /** Aborts when the call has been silent for `idleMs`, or ran `ceilingMs`. */
  readonly signal: AbortSignal;
  /** Call on every chunk received. */
  touch(): void;
  /** True once either limit fired — as opposed to a caller cancelling. */
  readonly fired: boolean;
  dispose(): void;
}

export function stallTimeout(idleMs: number, ceilingMs: number): StallTimeout {
  const controller = new AbortController();
  const fire = () => controller.abort(new DOMException('The model stopped responding.', 'TimeoutError'));
  let idle = setTimeout(fire, idleMs);
  const ceiling = setTimeout(fire, ceilingMs);

  return {
    signal: controller.signal,
    touch() {
      if (controller.signal.aborted) return;
      clearTimeout(idle);
      idle = setTimeout(fire, idleMs);
    },
    get fired() {
      return controller.signal.aborted;
    },
    dispose() {
      clearTimeout(idle);
      clearTimeout(ceiling);
    },
  };
}
