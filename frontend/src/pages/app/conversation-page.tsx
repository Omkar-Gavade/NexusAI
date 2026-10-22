import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import {
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
import { arenaModelsFor, takeHomepageDraft } from '@/lib/homepage-draft';
import { routes } from '@/lib/routes';
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
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [compareHandoff, setCompareHandoff] = useState<{ modelIds?: string[] } | null>(null);
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
    const draft = takeHomepageDraft();
    if (!draft) return;
    if (draft.prompt.trim()) setInitialDraft(draft.prompt.trim());
    if (draft.mode === 'compare') {
      setCompareHandoff(draft.modelIds ? { modelIds: draft.modelIds } : {});
    }
  }, []);

  // Applied once the catalog is known, so the visitor's picks are checked
  // against what this deployment can actually run.
  useEffect(() => {
    if (!compareHandoff || !models?.models.length) return;
    const chosen = arenaModelsFor(compareHandoff.modelIds, models.models);
    if (chosen) setSelection({ mode: 'compare', modelIds: chosen });
    setCompareHandoff(null);
  }, [compareHandoff, models]);

  /*
   * The conversation this page's own stream just created. Navigating to it
   * changes `conversationId`, which must not reset the stream that caused the
   * navigation — that reset wiped the first answer of every new conversation
   * mid-generation and left the server's placeholder row on screen instead.
   */
  const createdHere = useRef<string | null>(null);

  const onConversationCreated = useCallback(
    (id: string) => {
      createdHere.current = id;
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

  const { state, pending, streaming, active, liveMessageId, send, stop, reset } =
    useChatStream(streamCallbacks);

  const history = messages.data?.messages;
  const { ref: scroller, atBottom, jumpToLatest } = useScrollAnchor(state.text || history?.length);

  useEffect(() => {
    if (conversationId !== null && conversationId === createdHere.current) {
      createdHere.current = null;
      return;
    }
    reset();
  }, [conversationId, reset]);

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

  /** Re-runs one model on a persisted turn, by id. */
  const retryModelOn = useCallback(
    async (messageId: string, modelId: string) => {
      const targetConvId = conversationId ?? state.conversationId;
      if (!targetConvId) return;
      setRetryingTarget({ messageId, modelId });
      try {
        const updated = await retryMessageModel(targetConvId, messageId, modelId);
        updateCachedMessage(updated);
        // The turn may not be in cached history yet (retried from the live
        // view), so history is refreshed rather than relying on the patch.
        void client.invalidateQueries({ queryKey: messagesKey(targetConvId) });
      } catch {
        toast.error("Couldn't retry that model right now.");
      } finally {
        setRetryingTarget(null);
      }
    },
    [conversationId, state.conversationId, updateCachedMessage, client],
  );

  const onRetryModel = useCallback(
    async (assistant: Message, modelId: string) => {
      if (!(conversationId ?? state.conversationId)) {
        onRegenerate(assistant);
        return;
      }
      await retryModelOn(assistant.id, modelId);
    },
    [conversationId, state.conversationId, onRegenerate, retryModelOn],
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

  /*
   * While a turn is streaming, history can already contain it: the server
   * inserts the assistant row up front — as `failed`, so a crash can never
   * leave it looking in flight — and the first turn of a new conversation
   * navigates to its URL, which fetches history mid-stream. Treating that row
   * as the answer hid the live stream and put "None of the models could
   * complete" on screen while every model was still writing.
   *
   * So until the stream ends, the live turn owns its id: its placeholder row,
   * and the user message just before it, are left out of history. Once the
   * stream settles, history is the record and the optimistic copy steps aside.
   */
  const liveId = liveMessageId ?? state.messageId;
  const inFlight = streaming || active;

  // The placeholder row (failed, empty, no per-model record yet) can still be
  // cached for a moment after the stream ends, until the refetch lands. Every
  // finalised assistant row records its plan in `responses`, so an empty one
  // is the placeholder, not the answer.
  const settled =
    !inFlight &&
    liveId !== null &&
    (history?.some(
      (m) =>
        m.id === liveId &&
        !(m.status === 'failed' && m.responses.length === 0 && m.content === ''),
    ) ?? false);

  // While the optimistic turn is the one on screen, history leaves out its
  // rows — the user message and the assistant row after it — so the turn is
  // never rendered twice or replaced by its placeholder.
  const historyRows = useMemo(() => {
    if (settled || pending === null || !liveId || !history) return history;
    const index = history.findIndex((m) => m.id === liveId);
    if (index === -1) return history;
    const start = index > 0 && history[index - 1]?.role === 'user' ? index - 1 : index;
    return [...history.slice(0, start), ...history.slice(index + 1)];
  }, [history, liveId, settled, pending]);

  const showPendingTurn = pending !== null && !settled;

  const showEmpty = !showPendingTurn && !historyRows?.length && !loadingHistory && !messages.isError;

  return (
    <>
      <Header title={title} conversationId={conversationId} />

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} className="h-full overflow-y-auto">
          <div className="mx-auto w-full max-w-(--measure-conversation) px-(--gutter) pb-8 pt-14 max-lg:px-4">
            {showEmpty ? (
              <EmptyConversation
                disabled={noModels}
                name={user?.displayName}
                onPickPrompt={(text) => setPrefill({ text, nonce: Date.now() })}
              />
            ) : (
              <div className="flex flex-col gap-8">
                <MessageList
                  messages={historyRows}
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
                        onRetryModel={(modelId) => {
                          // Retrying one model needs the persisted turn. While
                          // the stream is open there is none to retry against,
                          // and resending the prompt would be a different
                          // request — so the control waits, and says why.
                          if (inFlight) return;
                          if (liveId) void retryModelOn(liveId, modelId);
                          else onSend(pending.prompt);
                        }}
                        retryingModelId={
                          retryingTarget && retryingTarget.messageId === liveId
                            ? retryingTarget.modelId
                            : null
                        }
                        retryDisabledReason={
                          inFlight ? 'Available when the comparison finishes' : null
                        }
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
        prefill={prefill}
      />
    </>
  );
}
