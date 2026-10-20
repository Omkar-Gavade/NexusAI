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
 * Filled in by `stream` as the provider reports usage, which every supported
 * provider does in-band — on the first frame, the last, or cumulatively on
 * each. A field left `null` means the provider did not report it; it is never
 * estimated, because a guessed count would surface as a measured cost.
 */
export interface StreamUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export function emptyUsage(): StreamUsage {
  return { inputTokens: null, outputTokens: null };
}

/**
 * The one interface the orchestrator knows. Provider SDK shapes, auth schemes
 * and error bodies stop here — nothing above this layer contains a
 * `if (provider === 'openai')`.
 *
 * Every model call streams, so time to first token is measured rather than
 * assumed, Arena panels fill as text arrives, and a single-model answer reaches
 * the reader without waiting for its last token. `generate` remains for the
 * on-demand Arena synthesis, which returns a finished message.
 */
export interface ProviderAdapter {
  readonly provider: string;
  /** False when no API key is configured; the registry reports NOT_CONFIGURED. */
  isConfigured(): boolean;
  generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult>;
  stream(
    request: GenerationRequest,
    signal: AbortSignal,
    usage?: StreamUsage,
  ): AsyncIterable<string>;
}
