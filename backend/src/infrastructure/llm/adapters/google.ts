import type { ProviderAdapter, GenerationRequest, GenerationResult } from '../adapter.ts';
import { classifyProviderError, classifyTransportError } from '../errors.ts';
import { readUpstreamSSE } from '../sse-parse.ts';
import { Errors } from '../../../domain/errors.ts';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini uses `contents` with `parts`, calls the assistant role "model", takes
 * the system prompt as `systemInstruction`, and reports safety blocks in-band
 * via `promptFeedback.blockReason` rather than an HTTP status. All of that is
 * normalised here.
 */
export class GoogleAdapter implements ProviderAdapter {
  readonly provider = 'google';

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
    const json = (await response.json()) as GeminiResponse;

    if (json.promptFeedback?.blockReason) {
      throw Errors.contentPolicy({
        provider: this.provider,
        modelId: request.model.id,
        blockReason: json.promptFeedback.blockReason,
      });
    }

    return {
      text: extractText(json),
      inputTokens: json.usageMetadata?.promptTokenCount ?? null,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
      finishReason: json.candidates?.[0]?.finishReason ?? null,
    };
  }

  async *stream(request: GenerationRequest, signal: AbortSignal): AsyncIterable<string> {
    const response = await this.post(request, signal, true);
    if (!response.body) return;

    for await (const payload of readUpstreamSSE(response.body, signal)) {
      let parsed: GeminiResponse;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const text = extractText(parsed);
      if (text) yield text;
    }
  }

  private async post(
    request: GenerationRequest,
    signal: AbortSignal,
    stream: boolean,
  ): Promise<Response> {
    const context = { provider: this.provider, modelId: request.model.id };
    const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const url = `${this.baseUrl}/models/${request.model.providerModelId}:${method}`;

    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal,
        // The key goes in a header, never the query string. Google accepts
        // `?key=`, but a URL travels through proxy access logs, error strings
        // and anything that records a request line — none of which should ever
        // hold a credential.
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey ?? '',
        },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: {
            maxOutputTokens: request.maxOutputTokens,
            ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          },
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

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function extractText(json: GeminiResponse): string {
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
