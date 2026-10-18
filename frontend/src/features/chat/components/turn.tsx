import type { Message } from '@nexusai/contracts';
import { fromMessage } from '../answer-view';
import { AnswerBlock } from './answer-block';
import { UserMessage } from './user-message';

/**
 * One persisted exchange. A user message and an assistant message are separate
 * rows on the wire; the reader sees a turn.
 */
export function Turn({
  message,
  onRegenerate,
  onRetryModel,
  onSelectAnswer,
  onCombineAnswers,
  onFollowUpAnswer,
  combining = false,
  retryingModelId = null,
}: {
  message: Message;
  onRegenerate: (message: Message) => void;
  onRetryModel?: ((message: Message, modelId: string) => void) | undefined;
  onSelectAnswer?: ((message: Message, modelId: string | null) => void) | undefined;
  onCombineAnswers?: ((message: Message) => void) | undefined;
  onFollowUpAnswer?: ((message: Message, modelId: string, displayName: string) => void) | undefined;
  combining?: boolean;
  retryingModelId?: string | null;
}) {
  if (message.role === 'user') {
    return <UserMessage content={message.content} />;
  }

  return (
    <AnswerBlock
      view={fromMessage(message)}
      onRegenerate={() => onRegenerate(message)}
      onRetryModel={(modelId) =>
        onRetryModel ? onRetryModel(message, modelId) : onRegenerate(message)
      }
      onSelectAnswer={
        onSelectAnswer ? (modelId) => onSelectAnswer(message, modelId) : undefined
      }
      onCombineAnswers={onCombineAnswers ? () => onCombineAnswers(message) : undefined}
      onFollowUpAnswer={
        onFollowUpAnswer
          ? (modelId, displayName) => onFollowUpAnswer(message, modelId, displayName)
          : undefined
      }
      combining={combining}
      retryingModelId={retryingModelId}
    />
  );
}
