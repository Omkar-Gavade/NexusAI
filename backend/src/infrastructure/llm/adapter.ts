import type { ModelDefinition } from '../../domain/models/catalog.ts';

export interface GenerationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerationRequest {
  readonly model: ModelDefinition;
  readonly messages: readonly GenerationMessage[];
  readonly maxOutputTokens: number;
  readonly temperature?: number;
}

export interface GenerationResult {
  readonly text: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly finishReason: string | null;
}

/**
 * The one interface the orchestrator knows. Provider SDK shapes, auth schemes
 * and error bodies stop here — nothing above this layer contains a
 * `if (provider === 'openai')`.
 *
 * Both methods exist because the product needs both, not for symmetry:
 * `generate` serves the per-model calls, whose text is never streamed to the
 * client, and `stream` serves the synthesis, which is.
 */
export interface ProviderAdapter {
  readonly provider: string;
  /** False when no API key is configured; the registry reports NOT_CONFIGURED. */
  isConfigured(): boolean;
  generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult>;
  stream(request: GenerationRequest, signal: AbortSignal): AsyncIterable<string>;
}
