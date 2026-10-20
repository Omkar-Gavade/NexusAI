import { describe, expect, it } from 'vitest';
import {
  classifyTask,
  estimateModelCost,
  getModelPricing,
  previewSmartRoute,
  VERIFIED_MODEL_PRICING,
} from '@nexusai/contracts';
import { loadConfig } from '../../src/config/env.ts';
import { ModelRegistry } from '../../src/domain/models/registry.ts';
import { TestAdapter } from '../../src/infrastructure/llm/adapters/test-adapter.ts';
import type { ProviderAdapter } from '../../src/infrastructure/llm/adapter.ts';

const BASE_ENV = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  JWT_PRIVATE_KEY: 'x',
  JWT_PUBLIC_KEY: 'y',
} as NodeJS.ProcessEnv;

function makeRegistry(configured: string[] = [], includeTest = false) {
  const config = loadConfig({
    ...BASE_ENV,
    NODE_ENV: 'test',
    TEST_PROVIDER_ENABLED: includeTest ? 'true' : 'false',
  } as NodeJS.ProcessEnv);
  const adapters = new Map<string, ProviderAdapter>();

  for (const provider of ['openai', 'anthropic', 'google', 'mistral', 'groq', 'deepseek']) {
    adapters.set(provider, {
      provider,
      isConfigured: () => configured.includes(provider),
      generate: async () => ({
        text: '',
        inputTokens: null,
        outputTokens: null,
        finishReason: null,
      }),
      stream: async function* () {},
    });
  }
  if (includeTest) adapters.set('test', new TestAdapter());

  return new ModelRegistry(config, adapters);
}

describe('Smart Model Router — task classification', () => {
  it('classifies coding, debugging, and technical prompts', () => {
    expect(
      classifyTask('Fix this TypeError in my TypeScript async function and refactor the SQL query'),
    ).toEqual({
      category: 'coding',
      label: 'coding & debugging question',
    });

    expect(classifyTask('```ts\nconst x: number = "bad";\n```\nWhy does this fail?').category).toBe(
      'coding',
    );
  });

  it('classifies summarization and document analysis prompts', () => {
    expect(
      classifyTask(
        'Summarize the following architecture document into key takeaways and action items',
      ),
    ).toEqual({
      category: 'summarization',
      label: 'summarization & document analysis task',
    });
  });

  it('classifies research and evidence-oriented prompts', () => {
    expect(
      classifyTask(
        'Compare the empirical evidence and methodology behind distributed consensus protocols',
      ),
    ).toEqual({
      category: 'research',
      label: 'research & evidence-oriented question',
    });
  });

  it('classifies reasoning-intensive prompts', () => {
    expect(
      classifyTask(
        'Prove by induction that a binary tree of height h has at most 2^(h+1) - 1 nodes step by step',
      ),
    ).toEqual({
      category: 'reasoning',
      label: 'reasoning-intensive task',
    });
  });

  it('classifies short low-latency prompts as quick questions', () => {
    expect(classifyTask('What is the capital of Japan?')).toEqual({
      category: 'quick',
      label: 'quick low-latency question',
    });
  });

  it('classifies explanatory prompts as general knowledge', () => {
    expect(
      classifyTask(
        'Explain how central banks use open market operations to influence short-term interest rates across different economic cycles in detail.',
      ),
    ).toEqual({
      category: 'general',
      label: 'general question',
    });
  });
});

describe('Smart Model Router — routing decisions & availability', () => {
  it('prioritizes Gemini 2.5 Flash for general questions when Google and Groq are configured', () => {
    const reg = makeRegistry(['google', 'groq']);
    reg.health.recordSuccess('google');
    reg.health.recordSuccess('groq');

    const { models, decision } = reg.routeTask(
      'Explain how photosynthesis converts light energy into chemical energy in plants in detail.',
      'single',
    );

    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe('gemini-flash');
    expect(decision.taskCategory).toBe('general');
    expect(decision.reason).toBe(
      'Auto-selected Gemini 2.5 Flash — suitable for this general question.',
    );
  });

  it('prioritizes Groq GPT-OSS 120B for quick questions and coding when Google and Groq are configured', () => {
    const reg = makeRegistry(['google', 'groq']);
    reg.health.recordSuccess('google');
    reg.health.recordSuccess('groq');

    const quickRoute = reg.routeTask('What is 12 * 14?', 'single');
    expect(quickRoute.models[0]?.id).toBe('llama-groq');
    expect(quickRoute.decision.taskCategory).toBe('quick');
    expect(quickRoute.decision.reason).toBe(
      'Auto-selected GPT-OSS 120B — suitable for this quick low-latency question.',
    );

    const codingRoute = reg.routeTask(
      'Debug this TypeScript React hook stack trace and fix the race condition',
      'single',
    );
    expect(codingRoute.models[0]?.id).toBe('llama-groq');
    expect(codingRoute.decision.taskCategory).toBe('coding');
  });

  it('excludes unconfigured, circuit-broken, and quota-exhausted providers and falls back to healthy models', () => {
    const reg = makeRegistry(['google', 'groq', 'deepseek', 'openai']);
    reg.health.recordSuccess('google');

    // Groq trips circuit breaker after 3 consecutive transient failures
    for (let i = 0; i < 3; i += 1) {
      reg.health.recordFailure('groq', { affectsHealth: true, isAuthError: false });
    }
    // DeepSeek has exhausted account quota (402)
    reg.health.recordFailure('deepseek', {
      affectsHealth: false,
      isAuthError: true,
      authCause: 'account',
    });
    // OpenAI credentials rejected (401)
    reg.health.recordFailure('openai', {
      affectsHealth: false,
      isAuthError: true,
      authCause: 'credentials',
    });

    const route = reg.routeTask(
      'Debug this TypeScript function and fix the null pointer bug',
      'single',
    );

    // Even though Groq or OpenAI would score high for coding, only Google is healthy
    expect(route.models.map((m) => m.id)).toEqual(['gemini-flash']);
    expect(route.decision.reason).toBe(
      'Auto-selected Gemini 2.5 Flash — suitable for this coding & debugging question.',
    );
  });

  it('selects multiple task-appropriate models in balanced synthesis mode', () => {
    const reg = makeRegistry(['google', 'groq', 'openai', 'mistral']);
    const route = reg.routeTask(
      'Compare the evidence and peer-reviewed studies on urban heat islands',
      'balanced',
    );

    expect(route.models).toHaveLength(3);
    expect(route.decision.taskCategory).toBe('research');
    expect(route.decision.selectedModelIds).toHaveLength(3);
    expect(route.decision.reason).toContain('balanced synthesis');
  });

  it('produces matching client/server previews via previewSmartRoute', () => {
    const reg = makeRegistry(['google', 'groq']);
    const wireModels = reg.toWire().map((m) => ({
      id: m.id,
      displayName: m.displayName,
      providerId: m.provider.id,
      availability: m.availability,
      contextWindow: m.contextWindow,
      capabilities: m.capabilities,
    }));

    const preview = previewSmartRoute('Summarize this meeting transcript', 'single', wireModels);
    expect(preview.taskCategory).toBe('summarization');
    expect(preview.selectedModelIds).toEqual(['gemini-flash']);
    expect(preview.reason).toBe(
      'Auto-selected Gemini 2.5 Flash — suitable for this summarization & document analysis task.',
    );
  });
});

describe('Transparent Performance & Cost — verified pricing and estimation', () => {
  it('calculates accurate USD estimates from verified pricing when provider tokens are present', () => {
    const res = estimateModelCost('gemini-flash', 1_000_000, 1_000_000);
    expect(res.currency).toBe('USD');
    // Paid-tier rates verified against ai.google.dev/gemini-api/docs/pricing
    // (October 2026): $0.30 input + $2.50 output per 1M tokens.
    expect(res.estimatedCostUsd).toBeCloseTo(2.8, 5);
    expect(res.source).toContain('Google Gemini API pricing');
  });

  it('returns null (Unknown) when token counts are missing or zero', () => {
    expect(estimateModelCost('gpt-4o', null, 500).estimatedCostUsd).toBeNull();
    expect(estimateModelCost('gpt-4o', 500, null).estimatedCostUsd).toBeNull();
    expect(estimateModelCost('gpt-4o', 0, 0).estimatedCostUsd).toBeNull();
    expect(estimateModelCost('gpt-4o', -10, 100).estimatedCostUsd).toBeNull();
  });

  it('returns null (Unknown) for unverified or test models rather than fabricating $0.00', () => {
    expect(getModelPricing('test-alpha')).toBeNull();
    const res = estimateModelCost('test-alpha', 1500, 3000);
    expect(res.estimatedCostUsd).toBeNull();
    expect(res.source).toBeNull();
  });

  it('includes identifiable source, currency, and upstreamModel for all verified catalog models', () => {
    for (const modelId of [
      'gpt-4o',
      'claude-sonnet',
      'gemini-flash',
      'mistral-large',
      'deepseek-chat',
      'llama-groq',
    ]) {
      const pricing = VERIFIED_MODEL_PRICING[modelId];
      expect(pricing).toBeDefined();
      expect(pricing?.currency).toBe('USD');
      expect(pricing?.source.length).toBeGreaterThan(10);
      expect(pricing?.inputUsdPerMillion).toBeGreaterThan(0);
      expect(pricing?.outputUsdPerMillion).toBeGreaterThan(0);
    }
  });
});
