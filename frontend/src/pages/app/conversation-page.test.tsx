import type { ChatEvent, Message } from '@nexusai/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/render';
import { sessionKey } from '@/features/auth/use-session';
import { conversationsKey } from '@/features/conversations/use-conversations';
import { messagesKey } from '@/features/chat/use-messages';
import { ConversationPage } from './conversation-page';

/**
 * One submitted question must produce exactly one user message and exactly one
 * answer on screen.
 *
 * The bug this pins: the page rendered persisted history *and* the optimistic
 * in-flight turn at the same time, and the optimistic turn was only ever
 * cleared when `conversationId` changed. For the first message of a new
 * conversation the id changes (null → id), so it cleared and the bug was
 * invisible. For every subsequent message in an existing conversation nothing
 * cleared it, so once the refetch landed the same turn was on screen twice —
 * once from history, once from the still-mounted optimistic block.
 */

vi.mock('@/features/chat/api', () => ({
  fetchMessages: vi.fn(),
  openChatStream: vi.fn(),
}));

vi.mock('@/features/models/use-models', () => ({
  useModels: () => ({ data: { models: [], auto: { available: true } } }),
}));

const api = await import('@/features/chat/api');

const model = { modelId: 'gpt-4o', provider: 'openai', displayName: 'GPT-4o' };

const message = (id: string, role: 'user' | 'assistant', content: string): Message => ({
  id,
  role,
  content,
  status: 'complete',
  synthesisModel: role === 'assistant' ? model : null,
  responses: [],
  agreement: null,
  sources: [],
  metadata: null,
  createdAt: new Date().toISOString(),
});

/** The turn already in the conversation before the user asks anything. */
const EXISTING = [message('u1', 'user', 'first question'), message('a1', 'assistant', 'first answer')];

const NEW_PROMPT = 'second question';
const NEW_ANSWER = 'The synthesized answer.';

function streamEvents(): ChatEvent[] {
  return [
    { type: 'start', conversationId: 'abc', messageId: 'a2', plan: [model], mode: 'auto' },
    { type: 'model_start', modelId: 'gpt-4o' },
    {
      type: 'model_complete',
      modelId: 'gpt-4o',
      text: 'model text',
      outcome: 'complete',
      latencyMs: 100,
      inputTokens: null,
      outputTokens: null,
    },
    { type: 'synthesis_start', model },
    { type: 'delta', text: NEW_ANSWER },
    { type: 'complete', messageId: 'a2', latencyMs: 300, firstTokenMs: 120 },
  ];
}

function setup(initialHistory: Message[] = EXISTING) {
  const client = createTestQueryClient();
  client.setQueryData(sessionKey, {
    id: 'u',
    email: 'a@b.co',
    displayName: 'A',
    preferences: { theme: 'system', routingMode: 'balanced', pinnedModelId: null },
    createdAt: new Date().toISOString(),
  });
  client.setQueryData(conversationsKey, {
    conversations: [{ id: 'abc', title: 'Chat', updatedAt: new Date().toISOString(), projectId: null }],
    nextCursor: null,
  });
  client.setQueryData(messagesKey('abc'), { messages: initialHistory, nextCursor: null });

  return {
    client,
    ...rtlRender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/c/abc']}>
          <Routes>
            <Route path="/c/:conversationId" element={<ConversationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.mocked(api.fetchMessages).mockReset();
  vi.mocked(api.openChatStream).mockReset();
});

describe('one question → one answer', () => {
  it('does not render the turn twice once history has caught up', async () => {
    const user = userEvent.setup();

    // After the turn, the server has persisted both new rows.
    vi.mocked(api.fetchMessages).mockResolvedValue({
      messages: [...EXISTING, message('u2', 'user', NEW_PROMPT), message('a2', 'assistant', NEW_ANSWER)],
      nextCursor: null,
    });

    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      for (const event of streamEvents()) yield event;
    });

    setup();

    await user.type(screen.getByRole('textbox', { name: /ask anything/i }), NEW_PROMPT);
    await user.keyboard('{Enter}');

    // The invariant, asserted as a convergence rather than a single frame:
    // stream events are batched onto requestAnimationFrame, so the refetch can
    // land a frame before `complete` does. What must be true is that the page
    // settles on exactly one copy — not that it never passes through a frame
    // where the optimistic turn and the refetched history overlap.
    await waitFor(() => {
      expect(screen.getAllByText(NEW_PROMPT)).toHaveLength(1);
      expect(screen.getAllByText(NEW_ANSWER)).toHaveLength(1);
    });
  });

  it('is not duplicated by a refetch that returns the same turn again', async () => {
    const user = userEvent.setup();
    const settled = [
      ...EXISTING,
      message('u2', 'user', NEW_PROMPT),
      message('a2', 'assistant', NEW_ANSWER),
    ];
    vi.mocked(api.fetchMessages).mockResolvedValue({ messages: settled, nextCursor: null });
    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      for (const event of streamEvents()) yield event;
    });

    const { client } = setup();
    await user.type(screen.getByRole('textbox', { name: /ask anything/i }), NEW_PROMPT);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getAllByText(NEW_ANSWER)).toHaveLength(1);
    });

    // A second refetch — a reconnect, a window refocus, a manual retry — must
    // not add another copy.
    await client.invalidateQueries({ queryKey: messagesKey('abc') });
    await waitFor(() => {
      expect(screen.getAllByText(NEW_PROMPT)).toHaveLength(1);
      expect(screen.getAllByText(NEW_ANSWER)).toHaveLength(1);
    });
  });

  it('renders one copy when the conversation is loaded fresh, as after a refresh', async () => {
    // A reload has no optimistic turn at all: history is the only source. This
    // pins that the persisted shape on its own is one user message and one
    // answer — the individual model responses are not separate turns.
    const reloaded = [
      ...EXISTING,
      message('u2', 'user', NEW_PROMPT),
      message('a2', 'assistant', NEW_ANSWER),
    ];
    vi.mocked(api.fetchMessages).mockResolvedValue({ messages: reloaded, nextCursor: null });

    setup(reloaded);

    await waitFor(() => {
      expect(screen.getAllByText(NEW_ANSWER)).toHaveLength(1);
    });
    expect(screen.getAllByText(NEW_PROMPT)).toHaveLength(1);
    expect(screen.queryAllByText('model text')).toHaveLength(0);
  });

  it('does not double-submit when Enter is pressed twice in one tick', () => {
    // Through the UI this is already prevented a layer above the latch: Enter
    // is a discrete event, so React flushes the composer's `setValue('')`
    // synchronously and the second press sees an empty box. Pinned here so a
    // refactor that makes the composer clear asynchronously cannot silently
    // reintroduce a double send. The latch itself is covered in
    // `use-chat-stream.test.tsx`, which is the layer it defends.
    vi.mocked(api.fetchMessages).mockResolvedValue({ messages: EXISTING, nextCursor: null });

    let opened = 0;
    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      opened += 1;
      for (const event of streamEvents()) yield event;
    });

    setup();
    const box = screen.getByRole('textbox', { name: /ask anything/i });
    fireEvent.change(box, { target: { value: NEW_PROMPT } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(opened).toBe(1);
  });

  it('is not duplicated by a refetch that lands mid-stream', async () => {
    const user = userEvent.setup();
    // History gains the turn while the stream is still open — a window refocus
    // or a reconnect during generation. The optimistic turn must not be shown
    // alongside it, and must not be dropped before it is actually persisted.
    const settled = [
      ...EXISTING,
      message('u2', 'user', NEW_PROMPT),
      message('a2', 'assistant', NEW_ANSWER),
    ];

    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    vi.mocked(api.fetchMessages).mockResolvedValue({ messages: settled, nextCursor: null });
    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      yield { type: 'start', conversationId: 'abc', messageId: 'a2', plan: [model], mode: 'auto' };
      yield { type: 'delta', text: NEW_ANSWER };
      await held;
      yield { type: 'complete', messageId: 'a2', latencyMs: 300, firstTokenMs: 120 };
    });

    const { client } = setup();
    await user.type(screen.getByRole('textbox', { name: /ask anything/i }), NEW_PROMPT);
    await user.keyboard('{Enter}');

    // Force history to arrive before the stream has completed.
    await client.invalidateQueries({ queryKey: messagesKey('abc') });
    await waitFor(() => {
      expect(screen.getAllByText(NEW_PROMPT).length).toBeGreaterThan(0);
    });

    release?.();

    await waitFor(() => {
      expect(screen.getAllByText(NEW_PROMPT)).toHaveLength(1);
      expect(screen.getAllByText(NEW_ANSWER)).toHaveLength(1);
    });
  });

  it('does not show the server’s in-flight placeholder as a failure while the answer streams', async () => {
    const user = userEvent.setup();
    // What the server really holds mid-turn: the user message, and the
    // assistant row inserted as `failed` with nothing in it yet.
    const placeholder: Message = {
      ...message('a2', 'assistant', ''),
      status: 'failed',
      synthesisModel: null,
      mode: 'compare',
    };
    vi.mocked(api.fetchMessages).mockResolvedValue({
      messages: [...EXISTING, message('u2', 'user', NEW_PROMPT), placeholder],
      nextCursor: null,
    });

    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      yield { type: 'start', conversationId: 'abc', messageId: 'a2', plan: [model], mode: 'compare' };
      yield { type: 'model_start', modelId: 'gpt-4o' };
      yield { type: 'arena_delta', modelId: 'gpt-4o', text: 'Partial arena text' };
      await held;
      yield {
        type: 'model_complete',
        modelId: 'gpt-4o',
        text: 'Partial arena text',
        outcome: 'complete',
        latencyMs: 100,
        inputTokens: null,
        outputTokens: null,
      };
      yield { type: 'complete', messageId: 'a2', latencyMs: 300, firstTokenMs: 40 };
    });

    const { client } = setup();
    await user.type(screen.getByRole('textbox', { name: /ask anything/i }), NEW_PROMPT);
    await user.keyboard('{Enter}');
    await client.invalidateQueries({ queryKey: messagesKey('abc') });

    await waitFor(() => expect(screen.getByText('Partial arena text')).toBeInTheDocument());
    expect(screen.queryByText(/could(n't| not) (complete|be generated)/i)).toBeNull();
    expect(screen.getAllByText(NEW_PROMPT)).toHaveLength(1);

    release?.();
  });

  it('keeps a failed model out of the transcript and still shows one answer', async () => {
    const user = userEvent.setup();
    const second = { modelId: 'gemini-flash', provider: 'google', displayName: 'Gemini 2.5 Flash' };

    vi.mocked(api.fetchMessages).mockResolvedValue({
      messages: [...EXISTING, message('u2', 'user', NEW_PROMPT), message('a2', 'assistant', NEW_ANSWER)],
      nextCursor: null,
    });
    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      yield {
        type: 'start',
        conversationId: 'abc',
        messageId: 'a2',
        plan: [model, second],
        mode: 'auto',
      };
      yield { type: 'model_start', modelId: 'gpt-4o' };
      yield { type: 'model_start', modelId: 'gemini-flash' };
      // One provider drops out. The turn must continue.
      yield {
        type: 'model_error',
        modelId: 'gemini-flash',
        code: 'RATE_LIMITED',
        message: 'This model did not return a response.',
      };
      yield {
        type: 'model_complete',
        modelId: 'gpt-4o',
        text: 'model text',
        outcome: 'complete',
        latencyMs: 120,
        inputTokens: null,
        outputTokens: null,
      };
      yield { type: 'synthesis_start', model };
      yield { type: 'delta', text: NEW_ANSWER };
      yield { type: 'complete', messageId: 'a2', latencyMs: 400, firstTokenMs: 200 };
    });

    setup();
    await user.type(screen.getByRole('textbox', { name: /ask anything/i }), NEW_PROMPT);
    await user.keyboard('{Enter}');

    // Exactly one answer, and the failure never became a chat message.
    await waitFor(() => {
      expect(screen.getAllByText(NEW_ANSWER)).toHaveLength(1);
      expect(screen.getAllByText(NEW_PROMPT)).toHaveLength(1);
    });

    // No raw provider vocabulary anywhere on screen.
    const text = document.body.textContent ?? '';
    for (const leak of [/\b429\b/, /RESOURCE_EXHAUSTED/i, /RATE_LIMITED/, /stack/i, /Error:/]) {
      expect(text).not.toMatch(leak);
    }
  });
});

describe('the first message of a new conversation', () => {
  it('keeps streaming across the navigation to the conversation it created', async () => {
    const user = userEvent.setup();
    const client = createTestQueryClient();
    client.setQueryData(sessionKey, {
      id: 'u',
      email: 'a@b.co',
      displayName: 'A',
      preferences: { theme: 'system', routingMode: 'balanced', pinnedModelId: null },
      createdAt: new Date().toISOString(),
    });
    client.setQueryData(conversationsKey, { conversations: [], nextCursor: null });

    // History for the new conversation, as the server holds it mid-turn.
    vi.mocked(api.fetchMessages).mockResolvedValue({
      messages: [
        message('u1', 'user', 'brand new question'),
        { ...message('a1', 'assistant', ''), status: 'failed', synthesisModel: null },
      ],
      nextCursor: null,
    });

    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      yield { type: 'start', conversationId: 'new1', messageId: 'a1', plan: [model], mode: 'manual' };
      yield { type: 'delta', text: 'Streaming into a brand new conversation.' };
      await held;
      yield { type: 'complete', messageId: 'a1', latencyMs: 300, firstTokenMs: 40 };
    });

    rtlRender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route path="/app" element={<ConversationPage />} />
            <Route path="/app/chat/:conversationId" element={<ConversationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.type(screen.getByRole('textbox', { name: /ask anything/i }), 'brand new question');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      // Mid-stream text is published to the last whole word.
      expect(screen.getByText(/Streaming into a brand new/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/could(n't| not) (complete|be generated)/i)).toBeNull();
    expect(screen.getAllByText('brand new question')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /stop generating/i })).toBeInTheDocument();

    release?.();
  });
});

describe('switching conversations while an answer is still streaming', () => {
  it('leaves the other stream running in the background and lets the new conversation send', async () => {
    const user = userEvent.setup();
    const client = createTestQueryClient();
    client.setQueryData(sessionKey, {
      id: 'u',
      email: 'a@b.co',
      displayName: 'A',
      preferences: { theme: 'system', routingMode: 'balanced', pinnedModelId: null },
      createdAt: new Date().toISOString(),
    });
    client.setQueryData(conversationsKey, { conversations: [], nextCursor: null });
    client.setQueryData(messagesKey('abc'), { messages: EXISTING, nextCursor: null });
    client.setQueryData(messagesKey('other'), { messages: [], nextCursor: null });
    vi.mocked(api.fetchMessages).mockResolvedValue({ messages: [], nextCursor: null });

    let releaseFirst: (() => void) | undefined;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let finishFirst: (() => void) | undefined;
    const firstStillOpen = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    let firstSignal: AbortSignal | undefined;
    vi.mocked(api.openChatStream)
      .mockImplementationOnce(async function* (_body, signal) {
        firstSignal = signal;
        yield { type: 'start', conversationId: 'abc', messageId: 'a2', plan: [model], mode: 'auto' };
        yield { type: 'model_start', modelId: 'gpt-4o' };
        // The fan-out is still running when the reader leaves.
        await firstHeld;
        yield { type: 'delta', text: 'Late text from the first conversation.' };
        // ...and is still open while the reader works in another conversation.
        await firstStillOpen;
        yield { type: 'complete', messageId: 'a2', latencyMs: 300, firstTokenMs: 120 };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'start', conversationId: 'other', messageId: 'b1', plan: [model], mode: 'manual' };
        yield { type: 'delta', text: 'Answer in the second conversation.' };
        yield { type: 'complete', messageId: 'b1', latencyMs: 100, firstTokenMs: 20 };
      });

    function Nav() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/c/other')}>
          go to other
        </button>
      );
    }

    rtlRender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/c/abc']}>
          <Nav />
          <Routes>
            <Route path="/c/:conversationId" element={<ConversationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.type(screen.getByRole('textbox', { name: /ask anything/i }), NEW_PROMPT);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: /stop generating/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'go to other' }));
    releaseFirst?.();
    // Let the first stream's late delta arrive while it is still open.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The first conversation's stream must not take over this view.
    await waitFor(() => expect(screen.queryByRole('button', { name: /stop generating/i })).toBeNull());
    expect(screen.queryByText(/Late text from the first conversation/)).toBeNull();
    // Leaving did not cancel it: the generation is allowed to finish and persist.
    expect(firstSignal?.aborted).toBe(false);

    // A message typed here is actually sent, not silently swallowed.
    await user.type(screen.getByRole('textbox', { name: /ask anything/i }), 'second conversation question');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(vi.mocked(api.openChatStream)).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText(/Answer in the second conversation/)).toBeInTheDocument(),
    );
    finishFirst?.();
  });
});

describe('Arena retry on the live turn', () => {
  it('does not offer a retry that would do nothing while the comparison is still streaming', async () => {
    const user = userEvent.setup();
    const beta = { modelId: 'test-beta', provider: 'test', displayName: 'Test Beta' };
    let finish: (() => void) | undefined;
    const open = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.mocked(api.openChatStream).mockImplementation(async function* () {
      yield { type: 'start', conversationId: 'abc', messageId: 'a2', plan: [model, beta], mode: 'compare' };
      yield { type: 'model_start', modelId: 'gpt-4o' };
      yield { type: 'model_start', modelId: 'test-beta' };
      yield { type: 'model_error', modelId: 'test-beta', code: 'TIMEOUT', message: 'x' };
      yield { type: 'arena_delta', modelId: 'gpt-4o', text: 'Still writing ' };
      await open;
      yield { type: 'complete', messageId: 'a2', latencyMs: 300, firstTokenMs: 40 };
    });

    setup();
    await user.type(screen.getByRole('textbox', { name: /ask anything/i }), NEW_PROMPT);
    await user.keyboard('{Enter}');

    const retry = await screen.findByRole('button', { name: /retry this model/i });
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute('title', expect.stringMatching(/when the comparison finishes/i));
    await user.click(retry);
    expect(vi.mocked(api.openChatStream)).toHaveBeenCalledTimes(1);

    finish?.();
  });
});

describe('starting from the empty conversation', () => {
  it('fills the composer with the picked starter and sends nothing', async () => {
    const user = userEvent.setup();
    const client = createTestQueryClient();
    client.setQueryData(sessionKey, {
      user: {
        id: 'u',
        email: 'a@b.co',
        displayName: 'Ada Lovelace',
        preferences: { theme: 'system', routingMode: 'balanced', pinnedModelId: null },
        createdAt: new Date().toISOString(),
      },
    });
    client.setQueryData(conversationsKey, { conversations: [], nextCursor: null });

    rtlRender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route path="/app" element={<ConversationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/hi ada/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /explain a difficult concept/i }));

    const composer = screen.getByRole('textbox', { name: /ask anything/i });
    expect(composer).toHaveValue(
      'Explain how attention works in transformers, with an intuitive analogy and a small worked example.',
    );
    expect(composer).toHaveFocus();
    expect(vi.mocked(api.openChatStream)).not.toHaveBeenCalled();
  });
});
