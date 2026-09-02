import { useCallback, useEffect, useRef, useReducer, useState } from 'react';
import type { ChatSelection } from '@nexusai/contracts';
import { isApiError } from '@/lib/http';
import { ulid } from '@/lib/id';
import { openChatStream } from './api';
import { initialStreamState, isStreaming, reduce, type StreamState } from './stream-reducer';

export interface PendingTurn {
  clientMessageId: string;
  prompt: string;
}

interface SendArgs {
  conversationId: string | null;
  prompt: string;
  selection: ChatSelection;
}

/**
 * Owns one generation. Stream state is local rather than global because it
 * updates every frame and has exactly one consumer — routing sixty updates a
 * second through a shared store would re-render the sidebar and the model
 * selector for no reason.
 */
export function useChatStream(callbacks: {
  onConversationCreated: (id: string) => void;
  /** Fired once a generation reaches any terminal state, so history refetches. */
  onSettled: (conversationId: string | null) => void;
}) {
  const [state, dispatch] = useReducer(reduce, initialStreamState);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const controller = useRef<AbortController | null>(null);

  /**
   * A synchronous in-flight latch.
   *
   * `state.phase` cannot guard this on its own: it is reducer state, so two
   * submits in the same tick — a double-press, or Enter arriving twice before
   * React re-renders — both read the pre-dispatch `idle` and both open a
   * stream. That is one question billed and persisted twice. A ref flips
   * before any await, so the second caller is turned away in the same tick.
   */
  const inFlight = useRef(false);

  // Deltas land far faster than a frame. They accumulate in a ref and flush on
  // requestAnimationFrame, so React commits at most once per frame regardless
  // of token rate — this is what keeps the composer responsive while streaming.
  const queue = useRef<Parameters<typeof reduce>[1][]>([]);
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const batch = queue.current;
    queue.current = [];
    for (const action of batch) dispatch(action);
  }, []);

  const enqueue = useCallback(
    (action: Parameters<typeof reduce>[1]) => {
      queue.current.push(action);
      frame.current ??= requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      controller.current?.abort();
    },
    [],
  );

  const send = useCallback(
    async ({ conversationId, prompt, selection }: SendArgs) => {
      if (inFlight.current || isStreaming(state.phase)) return;
      inFlight.current = true;

      const clientMessageId = ulid();
      setPending({ clientMessageId, prompt });
      dispatch({ kind: 'reset' });

      const abort = new AbortController();
      controller.current = abort;
      let created: string | null = null;

      try {
        for await (const event of openChatStream(
          { conversationId, message: prompt, selection, clientMessageId },
          abort.signal,
        )) {
          if (event.type === 'start' && conversationId === null) {
            created = event.conversationId;
            callbacks.onConversationCreated(event.conversationId);
          }
          enqueue({ kind: 'event', event });
        }
      } catch (error) {
        if (abort.signal.aborted) {
          enqueue({ kind: 'abort' });
          return;
        }
        enqueue({
          kind: 'event',
          event: {
            type: 'error',
            code: isApiError(error) ? error.code : 'INTERNAL',
            message: isApiError(error) ? error.message : 'Something went wrong.',
            partial: false,
            requestId: isApiError(error) ? (error.requestId ?? '') : '',
          },
        });
      } finally {
        inFlight.current = false;
        controller.current = null;

        /*
         * Apply whatever is still queued, without waiting for a frame.
         *
         * `requestAnimationFrame` does not fire while the page is not being
         * painted — a background tab, a hidden window. Batching onto it is a
         * rendering optimisation, so it is correct for deltas mid-stream: there
         * is nothing to paint anyway. It is not correct for the terminal
         * events. A turn that finished while hidden left `complete` sitting in
         * the queue, so the reducer never learned the message id, the turn
         * never reconciled against history, and the optimistic user message was
         * stranded on screen with no answer beneath it — reproduced with
         * `document.visibilityState === 'hidden'`.
         *
         * Flushing here makes correctness independent of paint: the frame
         * coalesces updates when one arrives, and the stream ending applies the
         * rest either way.
         */
        if (frame.current !== null) {
          cancelAnimationFrame(frame.current);
          frame.current = null;
        }
        flush();

        callbacks.onSettled(conversationId ?? created);
      }
    },
    [enqueue, flush, callbacks, state.phase],
  );

  /** Aborting the fetch is what tells the server to cancel the provider calls. */
  const stop = useCallback(() => {
    controller.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setPending(null);
    dispatch({ kind: 'reset' });
  }, []);

  return {
    state: state as StreamState,
    pending,
    streaming: isStreaming(state.phase),
    send,
    stop,
    reset,
  };
}
