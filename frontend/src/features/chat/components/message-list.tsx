import type { Message } from '@nexusai/contracts';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Turn } from './turn';

/**
 * History. Renders only what the backend returned — there are no placeholder
 * messages, and an empty conversation renders as empty rather than being padded
 * to look populated.
 */
export function MessageList({
  messages,
  isPending,
  isError,
  onRetry,
  onRegenerate,
}: {
  messages: Message[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onRegenerate: (message: Message) => void;
}) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-8" aria-busy="true">
        <span className="sr-only">Loading conversation</span>
        {[0, 1].map((row) => (
          <div key={row} className="flex flex-col gap-3">
            <Skeleton height={20} width="42%" className="self-end" />
            <Skeleton height={16} width="94%" />
            <Skeleton height={16} width="88%" />
            <Skeleton height={16} width="60%" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert
        title="This conversation couldn't be loaded."
        action={
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        Your messages are safe — this is a problem reaching the server, not a problem with the
        conversation.
      </Alert>
    );
  }

  if (!messages?.length) return null;

  return (
    <div className="flex flex-col gap-8">
      {messages.map((message) => (
        <Turn key={message.id} message={message} onRegenerate={onRegenerate} />
      ))}
    </div>
  );
}
