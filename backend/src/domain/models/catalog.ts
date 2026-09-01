import type { Capabilities } from '@nexusai/contracts';

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'groq'
  | 'deepseek'
  | 'test';

export interface ModelDefinition {
  /** Our public, opaque id. The client never parses it. */
  readonly id: string;
  readonly provider: ProviderId;
  readonly providerDisplayName: string;
  /** The provider's own identifier. Kept internal so a vendor rename is a
   *  one-line catalog edit with no user-visible effect. */
  readonly providerModelId: string;
  readonly displayName: string;
  readonly description: string;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly capabilities: Capabilities;
  /** Selection hints. Never serialised — publishing them would invite users to
   *  reverse-engineer routing and turn a calm product into a config surface. */
  readonly quality: 1 | 2 | 3 | 4 | 5;
  readonly speed: 1 | 2 | 3 | 4 | 5;
  /** Stable ordering. Position identifies a model on the provenance rail. */
  readonly rank: number;
  /** Preferred writer of the synthesis when available. */
  readonly synthesisCapable: boolean;
  readonly deprecated: boolean;
  /** Deterministic, in-process. Never routable in production. */
  readonly testOnly: boolean;
}

const text: Capabilities = {
  reasoning: false,
  vision: false,
  audio: false,
  video: false,
  documents: false,
  toolCalling: true,
};

const multimodal: Capabilities = { ...text, vision: true, documents: true };

/**
 * `providerModelId` is the upstream name, and upstream names are retired
 * without notice: `gemini-2.0-flash`, `deepseek-chat` and
 * `llama-3.3-70b-versatile` were all written from published documentation and
 * had all stopped resolving by the time a real key was configured. Nothing in
 * the type system can catch that — only a live call can, which is what
 * `tests/manual/provider-live.test.ts` is for. Run it when adding a model, and
 * when a model starts reporting MODEL_NOT_FOUND in production.
 */
export const CATALOG: readonly ModelDefinition[] = [
  {
    id: 'gpt-4o',
    provider: 'openai',
    providerDisplayName: 'OpenAI',
    providerModelId: 'gpt-4o',
    displayName: 'GPT-4o',
    description: 'Broad general reasoning with strong instruction following.',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: multimodal,
    quality: 5,
    speed: 3,
    rank: 10,
    synthesisCapable: true,
    deprecated: false,
    testOnly: false,
  },
  {
    id: 'claude-sonnet',
    provider: 'anthropic',
    providerDisplayName: 'Anthropic',
    providerModelId: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    description: 'Long-context analysis and careful technical reasoning.',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    capabilities: multimodal,
    quality: 5,
    speed: 3,
    rank: 20,
    synthesisCapable: true,
    deprecated: false,
    testOnly: false,
  },
  {
    id: 'gemini-flash',
    provider: 'google',
    providerDisplayName: 'Google',
    providerModelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    description: 'Fast responses across very large contexts.',
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    capabilities: multimodal,
    quality: 4,
    speed: 5,
    rank: 30,
    synthesisCapable: true,
    deprecated: false,
    testOnly: false,
  },
  {
    id: 'mistral-large',
    provider: 'mistral',
    providerDisplayName: 'Mistral',
    providerModelId: 'mistral-large-latest',
    displayName: 'Mistral Large',
    description: 'European-hosted general reasoning.',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    capabilities: text,
    quality: 4,
    speed: 4,
    rank: 40,
    synthesisCapable: true,
    deprecated: false,
    testOnly: false,
  },
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    providerDisplayName: 'DeepSeek',
    providerModelId: 'deepseek-v4-flash',
    displayName: 'DeepSeek V4 Flash',
    description: 'Strong technical and mathematical reasoning.',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    capabilities: text,
    quality: 4,
    speed: 4,
    rank: 50,
    synthesisCapable: false,
    deprecated: false,
    testOnly: false,
  },
  {
    id: 'llama-groq',
    provider: 'groq',
    providerDisplayName: 'Groq',
    providerModelId: 'openai/gpt-oss-120b',
    displayName: 'GPT-OSS 120B',
    description: 'Very low latency inference.',
    contextWindow: 128_000,
    // Lower than the others on purpose: this provider's entry tier caps total
    // tokens per minute at 8,000, and an 8,192 ceiling makes every request
    // fail with 413 before the model is reached. Observed live, not assumed.
    maxOutputTokens: 4_096,
    capabilities: text,
    quality: 3,
    speed: 5,
    rank: 60,
    synthesisCapable: false,
    deprecated: false,
    testOnly: false,
  },

  // Deterministic, in-process. Enabled only by TEST_PROVIDER_ENABLED, which
  // config refuses to set in production.
  {
    id: 'test-alpha',
    provider: 'test',
    providerDisplayName: 'Test',
    providerModelId: 'alpha',
    displayName: 'Test Alpha',
    description: 'Deterministic adapter for development and tests.',
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    capabilities: text,
    quality: 3,
    speed: 5,
    rank: 900,
    synthesisCapable: true,
    deprecated: false,
    testOnly: true,
  },
  {
    id: 'test-beta',
    provider: 'test',
    providerDisplayName: 'Test',
    providerModelId: 'beta',
    displayName: 'Test Beta',
    description: 'Deterministic adapter for development and tests.',
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    capabilities: text,
    quality: 3,
    speed: 5,
    rank: 910,
    // A second synthesis-capable test model, so the fixture matches the real
    // topology — four of the six production models can synthesise — and the
    // synthesis failover path can be exercised at all.
    synthesisCapable: true,
    deprecated: false,
    testOnly: true,
  },
  {
    id: 'test-gamma',
    provider: 'test',
    providerDisplayName: 'Test',
    providerModelId: 'gamma',
    displayName: 'Test Gamma',
    description: 'Deterministic adapter for development and tests.',
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    capabilities: text,
    quality: 3,
    speed: 5,
    rank: 920,
    synthesisCapable: false,
    deprecated: false,
    testOnly: true,
  },
];

/** One env var per provider, resolved once at boot. */
export const PROVIDER_KEY_ENV: Record<ProviderId, string | null> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GEMINI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  test: null,
};
