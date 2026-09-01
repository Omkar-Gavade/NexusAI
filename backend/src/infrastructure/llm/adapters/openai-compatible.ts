import type { ProviderAdapter, GenerationRequest, GenerationResult } from '../adapter.ts';
import { classifyProviderError, classifyTransportError } from '../errors.ts';
import { readUpstreamSSE } from '../sse-parse.ts';

export const OPENAI_COMPATIBLE_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
} as const;

/**
 * Four providers speak the OpenAI chat-completions dialect. They differ only in
 * base URL, so they share one adapter rather than four near-identical files.
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(
    readonly provider: string,
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult> {
    const response = await this.post(request, signal, false);
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: json.choices?.[0]?.message?.content ?? '',
      inputTokens: json.usage?.prompt_tokens ?? null,
      outputTokens: json.usage?.completion_tokens ?? null,
      finishReason: json.choices?.[0]?.finish_reason ?? null,
    };
  }

  async *stream(request: GenerationRequest, signal: AbortSignal): AsyncIterable<string> {
    const response = await this.post(request, signal, true);
    if (!response.body) return;

    for await (const payload of readUpstreamSSE(response.body, signal)) {
      let parsed: { choices?: Array<{ delta?: { content?: string } }> };
      try {
        parsed = JSON.parse(payload);
      } catch {
        // A frame that survived framing but is not JSON means corruption in
        // transit. Drop it rather than tearing down a live answer.
        continue;
      }
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  private async post(
    request: GenerationRequest,
    signal: AbortSignal,
    stream: boolean,
  ): Promise<Response> {
    const context = { provider: this.provider, modelId: request.model.id };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model.providerModelId,
          messages: request.messages,
          max_tokens: request.maxOutputTokens,
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
