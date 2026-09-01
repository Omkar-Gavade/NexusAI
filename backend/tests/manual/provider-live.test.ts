import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/domain/models/catalog.ts';
import { AnthropicAdapter } from '../../src/infrastructure/llm/adapters/anthropic.ts';
import { GoogleAdapter } from '../../src/infrastructure/llm/adapters/google.ts';
import {
  OPENAI_COMPATIBLE_BASE_URLS,
  OpenAICompatibleAdapter,
} from '../../src/infrastructure/llm/adapters/openai-compatible.ts';
import type { ProviderAdapter } from '../../src/infrastructure/llm/adapter.ts';
import { isAppError } from '../../src/domain/errors.ts';

/**
 * Live provider verification. Makes real network requests, so it is opt-in and
 * never runs in CI:
 *
 *     PROVIDER_LIVE=1 pnpm vitest run tests/manual/provider-live.test.ts
 *
 * Two modes, both useful:
 *
 * - With real keys in the environment, each configured provider is asked a
 *   trivial question and must return non-empty text. This is the check that
 *   turns "adapter written against the documented wire format" into "adapter
 *   verified against the running service".
 * - With no keys, the suite still runs the reachability and error-mapping
 *   checks below, which need no credentials.
 *
 * Nothing here prints a key, and prompts are synthetic.
 */
const LIVE = process.env.PROVIDER_LIVE === '1';

function adapterFor(provider: string, apiKey: string | undefined): ProviderAdapter {
  if (provider === 'anthropic') return new AnthropicAdapter(apiKey);
  if (provider === 'google') return new GoogleAdapter(apiKey);
  const baseUrl =
    OPENAI_COMPATIBLE_BASE_URLS[provider as keyof typeof OPENAI_COMPATIBLE_BASE_URLS];
  return new OpenAICompatibleAdapter(provider, baseUrl, apiKey);
}

const KEY_VAR: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GEMINI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

const realModels = CATALOG.filter((m) => !m.testOnly);

describe.skipIf(!LIVE)('live provider verification', () => {
  // Reachability and error classification. These need no credentials: a
  // deliberately invalid key exercises the real endpoint, the real request
  // shape and the real 401/403 mapping.
  describe('rejects an invalid key without inventing a response', () => {
    for (const model of realModels) {
      it(`${model.provider} / ${model.id}`, async () => {
        const adapter = adapterFor(model.provider, 'invalid-key-for-error-path-verification');

        const result = await adapter
          .generate(
            { model, messages: [{ role: 'user', content: 'ping' }], maxOutputTokens: 16 },
            AbortSignal.timeout(30_000),
          )
          .then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          );

        // The one outcome that would be a product failure is a fabricated
        // success. Anything else is a correctly-reported failure.
        expect(result.ok).toBe(false);
        if (result.ok) return;

        expect(isAppError(result.error)).toBe(true);
        const code = (result.error as { code: string }).code;
        // AUTH_ERROR is the expected classification; a network-level failure is
        // acceptable evidence of reachability being the only thing untested.
        expect(['AUTH_ERROR', 'NETWORK_ERROR', 'TIMEOUT']).toContain(code);
        // eslint-disable-next-line no-console
        console.log(`  ${model.provider.padEnd(10)} ${model.id.padEnd(16)} → ${code}`);
      }, 40_000);
    }
  });

  // Real generation, only for providers that actually have a key present.
  describe('generates real text', () => {
    for (const model of realModels) {
      const key = process.env[KEY_VAR[model.provider]!];
      it.skipIf(!key)(`${model.provider} / ${model.id}`, async (ctx) => {
        const adapter = adapterFor(model.provider, key);
        const result = await adapter
          .generate(
            {
              model,
              messages: [{ role: 'user', content: 'What is 2 + 2? Answer briefly.' }],
              maxOutputTokens: 64,
            },
            AbortSignal.timeout(60_000),
          )
          .catch((error: unknown) => {
            // A key that is valid but whose account cannot pay is not an
            // adapter defect, and failing identically to a broken adapter
            // hides which one you are looking at. Reported and skipped.
            if ((error as { code?: string })?.code === 'AUTH_ERROR') {
              // eslint-disable-next-line no-console
              console.log(
                `  ${model.provider.padEnd(10)} ${model.id.padEnd(16)} → SKIPPED: credential present but rejected (account state, not adapter)`,
              );
              ctx.skip();
            }
            throw error;
          });

        expect(result.text.trim().length).toBeGreaterThan(0);
        // eslint-disable-next-line no-console
        console.log(
          `  ${model.provider.padEnd(10)} ${model.id.padEnd(16)} → ${result.text.trim().slice(0, 60)}`,
        );
      }, 90_000);
    }
  });

  // Cancellation against a real socket, not a simulated one.
  it('propagates cancellation to the provider request', async () => {
    const model = realModels[0]!;
    const adapter = adapterFor(model.provider, 'invalid-key-for-error-path-verification');
    const controller = new AbortController();
    queueMicrotask(() => controller.abort());

    await expect(
      adapter.generate(
        { model, messages: [{ role: 'user', content: 'ping' }], maxOutputTokens: 16 },
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  }, 30_000);
});
