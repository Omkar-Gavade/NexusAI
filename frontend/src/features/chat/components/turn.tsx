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
}: {
  message: Message;
  onRegenerate: (message: Message) => void;
}) {
  if (message.role === 'user') {
    return <UserMessage content={message.content} />;
  }

  return (
    <AnswerBlock
      view={fromMessage(message)}
      onRegenerate={() => onRegenerate(message)}
      onRetryModel={() => onRegenerate(message)}
    />
  );
}
