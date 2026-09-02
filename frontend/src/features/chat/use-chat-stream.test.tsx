import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStream } from './use-chat-stream';

vi.mock('./api', () => ({ fetchMessages: vi.fn(), openChatStream: vi.fn() }));
const api = await import('./api');

const model = { modelId: 'gpt-4o', provider: 'openai', displayName: 'GPT-4o' };

beforeEach(() => vi.mocked(api.openChatStream).mockReset());

describe('useChatStream — one send at a time', () => {
  it('turns away a second send issued before the first has re-rendered', async () => {
    let opened = 0;
    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      opened += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      yield { type: 'start', conversationId: 'c', messageId: 'm', plan: [model], mode: 'auto' };
      yield { type: 'complete', messageId: 'm', latencyMs: 10, firstTokenMs: 5 };
    });

    const callbacks = { onConversationCreated: vi.fn(), onSettled: vi.fn() };
    const { result } = renderHook(() => useChatStream(callbacks));

    // Both calls happen before any state update is committed, so both read the
    // same `idle` phase. Only the synchronous ref latch separates them.
    await act(async () => {
      void result.current.send({ conversationId: 'c', prompt: 'a', selection: { mode: 'auto', routing: 'balanced' } });
      void result.current.send({ conversationId: 'c', prompt: 'a', selection: { mode: 'auto', routing: 'balanced' } });
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    await waitFor(() => expect(opened).toBeGreaterThan(0));
    expect(opened).toBe(1);
  });

  it('allows a new send once the previous one has finished', async () => {
    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      yield { type: 'start', conversationId: 'c', messageId: 'm', plan: [model], mode: 'auto' };
      yield { type: 'complete', messageId: 'm', latencyMs: 10, firstTokenMs: 5 };
    });

    const callbacks = { onConversationCreated: vi.fn(), onSettled: vi.fn() };
    const { result } = renderHook(() => useChatStream(callbacks));
    const args = { conversationId: 'c', prompt: 'a', selection: { mode: 'auto' as const, routing: 'balanced' as const } };

    await act(async () => { await result.current.send(args); });
    await act(async () => { await result.current.send(args); });

    expect(vi.mocked(api.openChatStream)).toHaveBeenCalledTimes(2);
  });
});

describe('useChatStream — correctness does not depend on painting', () => {
  it('applies the terminal state even if no animation frame ever runs', async () => {
    // The real failure: `requestAnimationFrame` does not fire while the page is
    // not painting. A turn that completed in a hidden tab left every queued
    // event unapplied — phase stayed `idle`, the message id never arrived, the
    // turn never reconciled against history, and the optimistic user message
    // was stranded with no answer under it.
    //
    // Modelled by an rAF that schedules nothing, which is exactly what a hidden
    // page provides.
    const rAF = window.requestAnimationFrame;
    window.requestAnimationFrame = (() => 1) as typeof window.requestAnimationFrame;

    try {
      vi.mocked(api.openChatStream).mockImplementation(async function* () {
        yield { type: 'start', conversationId: 'c', messageId: 'm-1', plan: [model], mode: 'auto' };
        yield { type: 'delta', text: 'the answer' };
        yield { type: 'complete', messageId: 'm-1', latencyMs: 12, firstTokenMs: 5 };
      });

      const callbacks = { onConversationCreated: vi.fn(), onSettled: vi.fn() };
      const { result } = renderHook(() => useChatStream(callbacks));

      await act(async () => {
        await result.current.send({
          conversationId: 'c',
          prompt: 'q',
          selection: { mode: 'auto', routing: 'balanced' },
        });
      });

      // Without the end-of-stream flush these stay `idle` / `null`, which is
      // the orphaned-turn bug.
      await waitFor(() => expect(result.current.state.phase).toBe('complete'));
      expect(result.current.state.messageId).toBe('m-1');
      expect(result.current.state.text).toBe('the answer');
    } finally {
      window.requestAnimationFrame = rAF;
    }
  });
});
