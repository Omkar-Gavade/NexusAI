import {
  ChatEvent,
  Message,
  MessageListResponse,
  type ChatRequest,
} from '@nexusai/contracts';
import { json, request, toApiError } from '@/lib/http';
import { collectPages } from '@/lib/paginate';
import { readSSE } from '@/lib/sse';

/** Pages walk backwards from the newest, so each older page is prepended. */
export async function fetchMessages(conversationId: string): Promise<MessageListResponse> {
  const { items, nextCursor } = await collectPages(
    async (cursor) => {
      const query = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await json(
        `/conversations/${conversationId}/messages${query}`,
        MessageListResponse,
      );
      return { items: page.messages, nextCursor: page.nextCursor };
    },
    { maxPages: 10, order: 'prepend' },
  );
  return { messages: items, nextCursor };
}

export function selectMessageAnswer(
  conversationId: string,
  messageId: string,
  selectedModelId: string | null,
) {
  return json(
    `/conversations/${conversationId}/messages/${messageId}/selection`,
    Message,
    {
      method: 'PATCH',
      body: { selectedModelId },
    },
  );
}

export function synthesizeMessageAnswers(
  conversationId: string,
  messageId: string,
  modelIds?: string[],
) {
  return json(
    `/conversations/${conversationId}/messages/${messageId}/synthesize`,
    Message,
    {
      method: 'POST',
      body: modelIds ? { modelIds } : {},
    },
  );
}

export function retryMessageModel(
  conversationId: string,
  messageId: string,
  modelId: string,
) {
  return json(
    `/conversations/${conversationId}/messages/${messageId}/retry-model`,
    Message,
    {
      method: 'POST',
      body: { modelId },
    },
  );
}

/**
 * Opens the generation stream.
 *
 * Preflight failures arrive as a normal 4xx with the JSON error envelope, which
 * is far easier to handle than a 200 containing an error frame. Once the stream
 * is open the status line is committed, so every later failure is an `error`
 * event inside a 200.
 */
export async function* openChatStream(
  body: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const response = await request('/chat/stream', { method: 'POST', body, signal });

  if (!response.ok) throw await toApiError(response);
  if (!response.body) throw await toApiError(response);

  for await (const payload of readSSE(response.body, signal)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      // A frame that survived the parser but is not JSON means the stream was
      // corrupted in transit. Drop it rather than tearing down a live answer.
      continue;
    }

    const result = ChatEvent.safeParse(parsed);
    if (result.success) yield result.data;
  }
}
