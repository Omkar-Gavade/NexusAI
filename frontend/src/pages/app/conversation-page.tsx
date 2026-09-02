import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import type { ChatSelection, Message } from '@nexusai/contracts';
import { Header } from '@/components/layout/header';
import { fromStream } from '@/features/chat/answer-view';
import { AnswerBlock } from '@/features/chat/components/answer-block';
import { Composer } from '@/features/chat/components/composer';
import { EmptyConversation } from '@/features/chat/components/empty-conversation';
import { JumpToLatest } from '@/features/chat/components/jump-to-latest';
import { prefetchMarkdown } from '@/features/chat/components/markdown-lazy';
import { MessageList } from '@/features/chat/components/message-list';
import { UserMessage } from '@/features/chat/components/user-message';
import { orderedSlots } from '@/features/chat/stream-reducer';
import { routes } from '@/lib/routes';
import { useChatStream } from '@/features/chat/use-chat-stream';
import { useMessages, messagesKey } from '@/features/chat/use-messages';
import { conversationsKey, useConversations } from '@/features/conversations/use-conversations';
import { useModels } from '@/features/models/use-models';
import { useScrollAnchor } from '@/features/chat/use-scroll-anchor';
import { useSession } from '@/features/auth/use-session';

export function ConversationPage() {
  const { conversationId = null } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();

  const { data: user } = useSession();
  const { data: models } = useModels();
  const { data: conversations } = useConversations();
  const messages = useMessages(conversationId);

  // Routing preference is a user setting; the session is the source of truth,
  // and local state only holds a per-conversation override.
  const [selection, setSelection] = useState<ChatSelection>(() => ({
    mode: 'auto',
    routing: user?.preferences.routingMode ?? 'balanced',
  }));

  const onConversationCreated = useCallback(
    (id: string) => {
      // replace, not push: Back should not return to a now-stale /c/new.
      navigate(routes.conversation(id), { replace: true });
      void client.invalidateQueries({ queryKey: conversationsKey });
    },
    [navigate, client],
  );

  const onSettled = useCallback(
    (id: string | null) => {
      if (id) void client.invalidateQueries({ queryKey: messagesKey(id) });
      void client.invalidateQueries({ queryKey: conversationsKey });
    },
    [client],
  );

  const streamCallbacks = useMemo(
    () => ({ onConversationCreated, onSettled }),
    [onConversationCreated, onSettled],
  );

  const { state, pending, streaming, send, stop, reset } = useChatStream(streamCallbacks);

  const history = messages.data?.messages;
  const { ref: scroller, atBottom, jumpToLatest } = useScrollAnchor(state.text || history?.length);

  useEffect(() => reset(), [conversationId, reset]);

  // Warm the markdown renderer while the user is still typing, so deferring it
  // costs nothing at the moment the first token lands.
  useEffect(prefetchMarkdown, []);

  const noModels = models ? !models.auto.available : false;
  const title =
    conversations?.conversations.find((c) => c.id === conversationId)?.title ??
    (conversationId ? 'Conversation' : 'New conversation');

  const onSend = useCallback(
    (prompt: string) => void send({ conversationId, prompt, selection }),
    [send, conversationId, selection],
  );

  /** Regenerating replays the prompt that produced the given answer. */
  const onRegenerate = useCallback(
    (assistant: Message) => {
      const index = history?.findIndex((m) => m.id === assistant.id) ?? -1;
      const prompt = index > 0 ? history?.[index - 1] : undefined;
      if (prompt?.role === 'user') onSend(prompt.content);
    },
    [history, onSend],
  );

  // `useMessages` is disabled on /app, and a disabled query stays `pending`
  // forever — so this has to key off whether a conversation exists at all,
  // not off the query status.
  const loadingHistory = conversationId !== null && messages.isPending;

  /**
   * Who owns the turn that was just streamed: the stream, or history.
   *
   * The page renders persisted history *and* the in-flight optimistic turn.
   * Nothing handed ownership from one to the other, and the optimistic turn was
   * only cleared when `conversationId` changed — which happens on the first
   * message of a new conversation (null → id) and never again. So from the
   * second message onward, the moment the refetch landed the same exchange was
   * on screen twice.
   *
   * The server tells us the id it persisted, in the `complete` event. Once that
   * id appears in history, history is authoritative and the optimistic copy
   * stands down. Matching on the id rather than on "the stream finished" is
   * what makes this exact: there is no window where both are shown and none
   * where neither is.
   *
   * Deliberately derived during render rather than cleared in an effect. If a
   * later refetch ever came back without the message, the optimistic turn
   * reappears instead of the answer vanishing — the failure mode points at
   * showing the reader too much, never too little.
   */
  const settled =
    state.messageId !== null && (history?.some((m) => m.id === state.messageId) ?? false);
  const showPendingTurn = pending !== null && !settled;

  const showEmpty = !showPendingTurn && !history?.length && !loadingHistory && !messages.isError;

  return (
    <>
      <Header title={title} conversationId={conversationId} />

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} className="h-full overflow-y-auto">
          <div className="mx-auto w-full max-w-(--measure-conversation) px-(--gutter) pb-8 pt-14 max-lg:px-4">
            {showEmpty ? (
              <EmptyConversation disabled={noModels} />
            ) : (
              <div className="flex flex-col gap-8">
                <MessageList
                  messages={history}
                  isPending={loadingHistory}
                  isError={messages.isError}
                  onRetry={() => void messages.refetch()}
                  onRegenerate={onRegenerate}
                />

                {/* The in-flight turn. Optimistic on the user side only — the
                    answer is whatever the server actually sends. */}
                {showPendingTurn && pending && (
                  <div className="flex flex-col gap-8">
                    <UserMessage content={pending.prompt} />
                    {state.phase !== 'idle' && (
                      <AnswerBlock
                        view={fromStream(state, orderedSlots(state))}
                        onRegenerate={() => onSend(pending.prompt)}
                        onRetryModel={() => onSend(pending.prompt)}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {!atBottom && (history?.length || showPendingTurn) ? (
          <JumpToLatest onClick={jumpToLatest} />
        ) : null}
      </div>

      <Composer
        selection={selection}
        onSelectionChange={setSelection}
        onSend={onSend}
        onStop={stop}
        streaming={streaming}
        disabled={noModels}
        disabledReason={noModels ? 'No real models are currently available.' : undefined}
      />
    </>
  );
}
