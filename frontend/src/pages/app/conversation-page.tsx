import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import {
  isRoutable,
  type ChatSelection,
  type Message,
  type MessageListResponse,
} from '@nexusai/contracts';
import { Header } from '@/components/layout/header';
import { fromStream } from '@/features/chat/answer-view';
import {
  retryMessageModel,
  selectMessageAnswer,
  synthesizeMessageAnswers,
} from '@/features/chat/api';
import { AnswerBlock } from '@/features/chat/components/answer-block';
import { Composer } from '@/features/chat/components/composer';
import { EmptyConversation } from '@/features/chat/components/empty-conversation';
import { JumpToLatest } from '@/features/chat/components/jump-to-latest';
import { prefetchMarkdown } from '@/features/chat/components/markdown-lazy';
import { MessageList } from '@/features/chat/components/message-list';
import { UserMessage } from '@/features/chat/components/user-message';
import { orderedSlots } from '@/features/chat/stream-reducer';
import { HOMEPAGE_DRAFT_STORAGE_KEY, routes } from '@/lib/routes';
import { useChatStream } from '@/features/chat/use-chat-stream';
import { useMessages, messagesKey } from '@/features/chat/use-messages';
import { conversationsKey, useConversations } from '@/features/conversations/use-conversations';
import { useModels } from '@/features/models/use-models';
import { useScrollAnchor } from '@/features/chat/use-scroll-anchor';
import { useSession } from '@/features/auth/use-session';
import { toast } from '@/stores/toast-store';

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
  const [initialDraft, setInitialDraft] = useState<string | undefined>(undefined);
  const [pendingCompareHandoff, setPendingCompareHandoff] = useState(false);
  const [combiningMessageId, setCombiningMessageId] = useState<string | null>(null);
  const [retryingTarget, setRetryingTarget] = useState<{
    messageId: string;
    modelId: string;
  } | null>(null);
  const [followUpContext, setFollowUpContext] = useState<{
    messageId: string;
    modelName: string;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HOMEPAGE_DRAFT_STORAGE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(HOMEPAGE_DRAFT_STORAGE_KEY);
      const parsed = JSON.parse(raw) as { prompt?: string; mode?: 'standard' | 'compare' };
      if (parsed.prompt?.trim()) {
        setInitialDraft(parsed.prompt.trim());
      }
      if (parsed.mode === 'compare') {
        setPendingCompareHandoff(true);
      }
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, []);

  useEffect(() => {
    if (!pendingCompareHandoff || !models?.models.length) return;
    const routable = models.models.filter((m) => isRoutable(m.availability));
    const chosen = (routable.length >= 2 ? routable : models.models)
      .slice(0, 3)
      .map((m) => m.id);
    if (chosen.length >= 2) {
      setSelection({ mode: 'compare', modelIds: chosen });
    }
    setPendingCompareHandoff(false);
  }, [pendingCompareHandoff, models]);

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
    (prompt: string) => {
      setFollowUpContext(null);
      void send({ conversationId, prompt, selection });
    },
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

  const updateCachedMessage = useCallback(
    (updated: Message) => {
      const targetConvId = conversationId ?? state.conversationId;
      if (!targetConvId) return;
      client.setQueryData<MessageListResponse>(messagesKey(targetConvId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.id === updated.id ? updated : m)),
        };
      });
    },
    [client, conversationId, state.conversationId],
  );

  const onSelectAnswer = useCallback(
    async (assistant: Message, selectedModelId: string | null) => {
      const targetConvId = conversationId ?? state.conversationId;
      if (!targetConvId) return;
      try {
        const updated = await selectMessageAnswer(targetConvId, assistant.id, selectedModelId);
        updateCachedMessage(updated);
      } catch {
        toast.error("Couldn't save your answer selection.");
      }
    },
    [conversationId, state.conversationId, updateCachedMessage],
  );

  const onCombineAnswers = useCallback(
    async (assistant: Message) => {
      const targetConvId = conversationId ?? state.conversationId;
      if (!targetConvId) return;
      setCombiningMessageId(assistant.id);
      try {
        const updated = await synthesizeMessageAnswers(targetConvId, assistant.id);
        updateCachedMessage(updated);
      } catch {
        toast.error("Couldn't combine the model answers right now.");
      } finally {
        setCombiningMessageId(null);
      }
    },
    [conversationId, state.conversationId, updateCachedMessage],
  );

  const onRetryModel = useCallback(
    async (assistant: Message, modelId: string) => {
      const targetConvId = conversationId ?? state.conversationId;
      if (!targetConvId) {
        onRegenerate(assistant);
        return;
      }
      setRetryingTarget({ messageId: assistant.id, modelId });
      try {
        const updated = await retryMessageModel(targetConvId, assistant.id, modelId);
        updateCachedMessage(updated);
      } catch {
        toast.error("Couldn't retry that model right now.");
      } finally {
        setRetryingTarget(null);
      }
    },
    [conversationId, state.conversationId, onRegenerate, updateCachedMessage],
  );

  const onFollowUpAnswer = useCallback(
    (assistant: Message, modelId: string, displayName: string) => {
      void onSelectAnswer(assistant, modelId);
      setFollowUpContext({ messageId: assistant.id, modelName: displayName });
      document.getElementById('composer')?.focus();
    },
    [onSelectAnswer],
  );

  // `useMessages` is disabled on /app, and a disabled query stays `pending`
  // forever — so this has to key off whether a conversation exists at all,
  // not off the query status.
  const loadingHistory = conversationId !== null && messages.isPending;

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
                  onRetryModel={onRetryModel}
                  onSelectAnswer={onSelectAnswer}
                  onCombineAnswers={onCombineAnswers}
                  onFollowUpAnswer={onFollowUpAnswer}
                  combiningMessageId={combiningMessageId}
                  retryingTarget={retryingTarget}
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
        followUpContext={
          followUpContext
            ? {
                modelName: followUpContext.modelName,
                onClear: () => setFollowUpContext(null),
              }
            : null
        }
        initialValue={initialDraft}
      />
    </>
  );
}
