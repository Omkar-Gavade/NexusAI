import { ChatEvent, MessageListResponse, type ChatRequest } from '@nexusai/contracts';
import { json, request, toApiError } from '@/lib/http';
import { readSSE } from '@/lib/sse';

export function fetchMessages(conversationId: string) {
  return json(`/conversations/${conversationId}/messages`, MessageListResponse);
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
