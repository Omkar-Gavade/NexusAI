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
  /*
   * Published synchronously, not through the frame batch below: the page uses
   * them to keep history from rendering the turn that is still streaming, and
   * a history fetch can land before the next animation frame — or long before
   * it, in a background tab where frames do not run at all.
   */
  const [active, setActive] = useState(false);
  const [liveMessageId, setLiveMessageId] = useState<string | null>(null);
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

  /*
   * Which send this view is listening to. `reset` (the reader opened another
   * conversation) moves it on, which *detaches* the running stream rather than
   * cancelling it: the request keeps going so the server finishes and persists
   * that answer, but its events stop reaching this view and its latch is
   * released. Without this the old stream kept dispatching into the new
   * conversation — its Stop button cancelled the other answer, and a message
   * typed here was turned away by the still-held latch.
   */
  const generation = useRef(0);

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
      const mine = ++generation.current;
      const current = () => generation.current === mine;

      const clientMessageId = ulid();
      setPending({ clientMessageId, prompt });
      setActive(true);
      setLiveMessageId(null);
      dispatch({ kind: 'reset' });

      const abort = new AbortController();
      controller.current = abort;
      let created: string | null = null;
      let settled = false;

      try {
        for await (const event of openChatStream(
          { conversationId, message: prompt, selection, clientMessageId },
          abort.signal,
        )) {
          if (event.type === 'start') {
            created = event.conversationId;
            if (current()) {
              setLiveMessageId(event.messageId);
              if (conversationId === null) callbacks.onConversationCreated(event.conversationId);
            }
          }
          if (event.type === 'complete' || event.type === 'error' || event.type === 'cancelled') {
            settled = true;
          }
          if (current()) enqueue({ kind: 'event', event });
        }

        /*
         * The body ended without a terminal frame — a proxy cut the connection,
         * or the server died mid-turn. Without this the reducer stayed in
         * `models`/`synthesis` forever: a spinner that never stopped and a
         * composer stuck on Stop. Whatever text arrived is kept as partial.
         */
        // Belt and braces for the same case `readSSE` now reports: a stopped
        // stream must leave the streaming state even if its body just ended.
        if (abort.signal.aborted) {
          if (current()) enqueue({ kind: 'abort' });
          return;
        }

        if (!settled && current()) {
          enqueue({
            kind: 'event',
            event: {
              type: 'error',
              code: 'NETWORK_ERROR',
              message: 'The connection closed before the answer finished.',
              partial: true,
              requestId: '',
            },
          });
        }
      } catch (error) {
        if (!current()) return;
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
        // A detached stream only refreshes the caches of the conversation it
        // belonged to, so its answer is there when the reader goes back; the
        // view-level cleanup below belongs to whichever stream is current.
        if (current()) {
          inFlight.current = false;
          controller.current = null;

          /*
           * Apply whatever is still queued, without waiting for a frame.
           *
           * `requestAnimationFrame` does not fire while the page is not being
           * painted — a background tab, a hidden window. Batching onto it is a
           * rendering optimisation, so it is correct for deltas mid-stream:
           * there is nothing to paint anyway. It is not correct for the
           * terminal events. A turn that finished while hidden left `complete`
           * sitting in the queue, so the reducer never learned the message id,
           * the turn never reconciled against history, and the optimistic user
           * message was stranded on screen with no answer beneath it —
           * reproduced with `document.visibilityState === 'hidden'`.
           *
           * Flushing here makes correctness independent of paint: the frame
           * coalesces updates when one arrives, and the stream ending applies
           * the rest either way.
           */
          if (frame.current !== null) {
            cancelAnimationFrame(frame.current);
            frame.current = null;
          }
          flush();
          setActive(false);
        }

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
    // Detach, not cancel: see `generation`.
    generation.current += 1;
    inFlight.current = false;
    controller.current = null;
    queue.current = [];
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setActive(false);
    setPending(null);
    setLiveMessageId(null);
    dispatch({ kind: 'reset' });
  }, []);

  return {
    state: state as StreamState,
    pending,
    /** From send until the stream has ended, independent of frame timing. */
    active,
    liveMessageId,
    streaming: isStreaming(state.phase),
    send,
    stop,
    reset,
  };
}
