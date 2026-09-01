import { AlertCircle, FileText, RotateCcw, X } from 'lucide-react';
import clsx from 'clsx';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';

/**
 * There is no upload endpoint yet. This renders the states the contract will
 * produce and nothing else — in particular there is no percentage bar, because
 * the backend does not report progress and a moving bar that is not measuring
 * anything is a lie about what the system knows.
 */
export type AttachmentStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface Attachment {
  id: string;
  name: string;
  /** Bytes, when the browser reported it. Never estimated. */
  size: number | null;
  status: AttachmentStatus;
  error: string | null;
}

const STATUS_LABEL: Record<AttachmentStatus, string> = {
  uploading: 'Uploading',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

export function AttachmentTray({
  attachments,
  onRemove,
  onRetry,
}: {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <ul aria-label="Attachments" className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className={clsx(
            'flex max-w-full items-center gap-1.5 rounded-mark border bg-raised py-1 pl-2 pr-1',
            attachment.status === 'failed' ? 'border-danger/40' : 'border-line-subtle',
          )}
        >
          <Indicator status={attachment.status} />

          {/* Long filenames truncate in the middle so the extension survives. */}
          <span className="min-w-0 truncate text-meta text-ink-2" title={attachment.name}>
            {attachment.name}
          </span>

          <span data-register="machine" className="shrink-0 text-note uppercase text-ink-3">
            {STATUS_LABEL[attachment.status]}
          </span>

          {attachment.status === 'failed' && (
            <IconButton
              size="sm"
              label={`Retry ${attachment.name}`}
              icon={<RotateCcw size={12} aria-hidden="true" />}
              onClick={() => onRetry(attachment.id)}
            />
          )}

          <IconButton
            size="sm"
            label={`Remove ${attachment.name}`}
            icon={<X size={12} aria-hidden="true" />}
            onClick={() => onRemove(attachment.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function Indicator({ status }: { status: AttachmentStatus }) {
  if (status === 'uploading' || status === 'processing') {
    // Indeterminate, because the backend reports no progress. Truthful beats
    // reassuring.
    return <Spinner size={12} className="shrink-0 text-ink-3" />;
  }
  if (status === 'failed') {
    return <AlertCircle size={12} aria-hidden="true" className="shrink-0 text-danger" />;
  }
  return <FileText size={12} aria-hidden="true" className="shrink-0 text-ink-3" />;
}
