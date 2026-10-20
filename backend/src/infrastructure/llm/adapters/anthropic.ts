import type {
  ProviderAdapter,
  GenerationRequest,
  GenerationResult,
  StreamUsage,
} from '../adapter.ts';
import { classifyProviderError, classifyTransportError } from '../errors.ts';
import { readUpstreamSSE } from '../sse-parse.ts';

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';

/** In-stream error types, mapped to the HTTP status each stands for. */
const ANTHROPIC_STREAM_ERROR_STATUS: Record<string, number> = {
  invalid_request_error: 400,
  authentication_error: 401,
  billing_error: 402,
  permission_error: 403,
  not_found_error: 404,
  request_too_large: 413,
  rate_limit_error: 429,
  api_error: 500,
  overloaded_error: 503,
};
const API_VERSION = '2023-06-01';

/**
 * Anthropic takes the system prompt as a top-level field rather than a message,
 * and streams `content_block_delta` events. Both quirks stop here.
 */
export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = 'anthropic';

  constructor(
    private readonly apiKey: string | undefined,
    /** Overridable for a gateway or proxy, and so the wire format can be tested. */
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult> {
    const response = await this.post(request, signal, false);
    const json = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = (json.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      text,
      inputTokens: json.usage?.input_tokens ?? null,
      outputTokens: json.usage?.output_tokens ?? null,
      finishReason: json.stop_reason ?? null,
    };
  }

  async *stream(
    request: GenerationRequest,
    signal: AbortSignal,
    usage?: StreamUsage,
  ): AsyncIterable<string> {
    const response = await this.post(request, signal, true);
    if (!response.body) return;

    for await (const payload of readUpstreamSSE(response.body, signal)) {
      let parsed: {
        type?: string;
        delta?: { type?: string; text?: string };
        message?: { usage?: { input_tokens?: number; output_tokens?: number } };
        usage?: { output_tokens?: number };
        error?: { type?: string };
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      // A failure after the 200 arrives in-band (`overloaded_error` is the
      // common one). Ignoring it ended the stream quietly and recorded a
      // truncated answer as complete.
      if (parsed.type === 'error') {
        throw classifyProviderError(
          ANTHROPIC_STREAM_ERROR_STATUS[parsed.error?.type ?? ''] ?? 500,
          payload,
          { provider: this.provider, modelId: request.model.id, inStream: true },
        );
      }
      // Input is reported once on `message_start`; output is cumulative on
      // `message_delta`, so the last one seen is the total.
      if (usage && parsed.type === 'message_start' && parsed.message?.usage) {
        usage.inputTokens = parsed.message.usage.input_tokens ?? usage.inputTokens;
      }
      if (usage && parsed.type === 'message_delta' && parsed.usage) {
        usage.outputTokens = parsed.usage.output_tokens ?? usage.outputTokens;
      }
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        if (parsed.delta.text) yield parsed.delta.text;
      }
    }
  }

  private async post(
    request: GenerationRequest,
    signal: AbortSignal,
    stream: boolean,
  ): Promise<Response> {
    const context = { provider: this.provider, modelId: request.model.id };

    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const turns = request.messages.filter((m) => m.role !== 'system');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey ?? '',
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: request.model.providerModelId,
          max_tokens: request.maxOutputTokens,
          ...(system ? { system } : {}),
          messages: turns,
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          stream,
        }),
      });
    } catch (error) {
      throw classifyTransportError(error, signal, context);
    }

    if (!response.ok) {
      throw classifyProviderError(response.status, await safeText(response), context);
    }
    return response;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
