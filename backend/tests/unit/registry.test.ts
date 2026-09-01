import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/env.ts';
import { ModelRegistry } from '../../src/domain/models/registry.ts';
import { ProviderHealthTracker } from '../../src/domain/models/health.ts';
import { TestAdapter } from '../../src/infrastructure/llm/adapters/test-adapter.ts';
import type { ProviderAdapter } from '../../src/infrastructure/llm/adapter.ts';

const BASE_ENV = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  JWT_PRIVATE_KEY: 'x',
  JWT_PUBLIC_KEY: 'y',
} as NodeJS.ProcessEnv;

function registry(env: Partial<NodeJS.ProcessEnv> = {}, configured: string[] = []) {
  // The test provider is on by default here so there is something routable to
  // reason about; individual cases turn it off explicitly.
  const config = loadConfig({
    ...BASE_ENV,
    NODE_ENV: 'test',
    TEST_PROVIDER_ENABLED: 'true',
    ...env,
  } as NodeJS.ProcessEnv);
  const adapters = new Map<string, ProviderAdapter>();

  for (const provider of ['openai', 'anthropic', 'google', 'mistral', 'groq', 'deepseek']) {
    adapters.set(provider, {
      provider,
      isConfigured: () => configured.includes(provider),
      generate: async () => ({ text: '', inputTokens: null, outputTokens: null, finishReason: null }),
      stream: async function* () {},
    });
  }
  if (config.TEST_PROVIDER_ENABLED) adapters.set('test', new TestAdapter());

  return new ModelRegistry(config, adapters);
}

describe('ModelRegistry availability', () => {
  it('reports NOT_CONFIGURED when a provider has no key', () => {
    const r = registry();
    const model = r.find('gpt-4o')!;
    expect(r.availabilityOf(model)).toBe('NOT_CONFIGURED');
  });

  // Configured but never called is genuinely unknown — claiming AVAILABLE
  // before anything succeeded would be an unverified assertion.
  it('reports UNKNOWN for a configured provider that has not been used', () => {
    const r = registry({}, ['openai']);
    expect(r.availabilityOf(r.find('gpt-4o')!)).toBe('UNKNOWN');
  });

  it('reaches AVAILABLE only after a real success', () => {
    const r = registry({}, ['openai']);
    r.health.recordSuccess('openai');
    expect(r.availabilityOf(r.find('gpt-4o')!)).toBe('AVAILABLE');
  });

  it('opens after repeated failures and recovers after the cooldown', () => {
    const tracker = new ProviderHealthTracker();
    for (let i = 0; i < 3; i += 1) {
      tracker.recordFailure('openai', { affectsHealth: true, isAuthError: false });
    }
    expect(tracker.availability('openai', true)).toBe('TEMPORARILY_UNAVAILABLE');
    expect(tracker.availability('openai', true, Date.now() + 61_000)).toBe('UNKNOWN');
  });

  // `affectsHealth: false` is not incidental — it is exactly what the caller
  // passes, because an auth failure is not retryable. Asserting it with `true`
  // tested a combination that never occurs, and hid the fact that a rejected
  // key was being discarded before it reached the tracker.
  it('records a rejected key even though the failure is not retryable', () => {
    const tracker = new ProviderHealthTracker();
    tracker.recordFailure('openai', { affectsHealth: false, isAuthError: true });
    expect(tracker.availability('openai', true)).toBe('CONFIGURED_BUT_UNAVAILABLE');
  });

  it('re-checks a rejected key after the cooldown rather than giving up forever', () => {
    const tracker = new ProviderHealthTracker();
    const at = Date.now();
    tracker.recordFailure('openai', { affectsHealth: false, isAuthError: true });

    expect(tracker.availability('openai', true, at + 60_000)).toBe('CONFIGURED_BUT_UNAVAILABLE');
    expect(tracker.availability('openai', true, at + 16 * 60_000)).toBe('UNKNOWN');
  });

  it('ignores failures that say nothing about the provider', () => {
    const tracker = new ProviderHealthTracker();
    for (let i = 0; i < 5; i += 1) {
      tracker.recordFailure('openai', { affectsHealth: false, isAuthError: false });
    }
    expect(tracker.availability('openai', true)).toBe('UNKNOWN');
  });
});

describe('ModelRegistry selection', () => {
  it('excludes test-only models from the catalog entirely when disabled', () => {
    const r = registry({ TEST_PROVIDER_ENABLED: 'false' });
    expect(r.find('test-alpha')).toBeUndefined();
    expect(r.toWire().some((m) => m.id.startsWith('test-'))).toBe(false);
  });

  it('reports auto unavailable when nothing is routable', () => {
    const r = registry({ TEST_PROVIDER_ENABLED: 'false' });
    expect(r.routable()).toHaveLength(0);
    // This is what disables the composer in the client.
    expect(r.autoAvailable()).toBe(false);
  });

  it('fans out by routing mode', () => {
    const r = registry();
    expect(r.select('single')).toHaveLength(1);
    expect(r.select('balanced')).toHaveLength(3);
  });

  it('never selects more than the configured maximum', () => {
    const r = registry({ MAX_MODELS_PER_REQUEST: '2' });
    expect(r.select('thorough').length).toBeLessThanOrEqual(2);
  });

  it('returns a stable plan order so rail positions do not move', () => {
    const r = registry();
    expect(r.select('balanced').map((m) => m.id)).toEqual(r.select('balanced').map((m) => m.id));
  });

  it('omits routing internals from the wire shape', () => {
    const wire = registry().toWire()[0]!;
    for (const leaked of ['quality', 'speed', 'rank', 'providerModelId', 'synthesisCapable']) {
      expect(wire).not.toHaveProperty(leaked);
    }
  });
});

describe('test adapter safety', () => {
  // The adapter returns clearly-labelled placeholder text. Shipping it as a
  // production provider would be fabricating model responses, so config refuses
  // rather than warns.
  it('refuses to load a production config with the test provider enabled', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exited');
    }) as never);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() =>
      loadConfig({
        ...BASE_ENV,
        NODE_ENV: 'production',
        TEST_PROVIDER_ENABLED: 'true',
      } as NodeJS.ProcessEnv),
    ).toThrow('exited');

    exit.mockRestore();
    stderr.mockRestore();
  });

  it('leaves production with nothing routable when no key is configured', () => {
    // main.ts turns this into a fatal boot failure rather than a silent
    // start with a permanently disabled composer.
    const r = registry({ NODE_ENV: 'production', TEST_PROVIDER_ENABLED: 'false' });
    expect(r.routable()).toHaveLength(0);
    expect(r.autoAvailable()).toBe(false);
  });
});
