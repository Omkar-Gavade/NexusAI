import { describe, expect, it } from 'vitest';
import { classifyProviderError, classifyTransportError } from '../../src/infrastructure/llm/errors.ts';

const ctx = { provider: 'google', modelId: 'gemini-flash' };

/**
 * Classification is what decides whether a provider is marked as having bad
 * credentials, so getting it wrong is not cosmetic: an auth failure that reads
 * as a request error never opens the circuit and never tells the operator why
 * nothing works.
 */
describe('classifyProviderError', () => {
  // Verified against the live endpoint: Google answers a rejected key with 400
  // INVALID_ARGUMENT, not 401.
  it('treats Google’s 400 API_KEY_INVALID as an auth failure', () => {
    const body = JSON.stringify({
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        status: 'INVALID_ARGUMENT',
        details: [{ reason: 'API_KEY_INVALID' }],
      },
    });
    expect(classifyProviderError(400, body, ctx).code).toBe('AUTH_ERROR');
  });

  it.each([401, 403])('treats %i as an auth failure', (status) => {
    expect(classifyProviderError(status, '{}', ctx).code).toBe('AUTH_ERROR');
  });

  // Observed live: DeepSeek returns 402 "Insufficient Balance". It fell through
  // to the generic retryable provider error, so every turn would retry a
  // failure that can never succeed while the model stayed advertised.
  it('treats an unpayable account as needing an operator, not a retry', () => {
    const body = JSON.stringify({ error: { message: 'Insufficient Balance' } });

    const byStatus = classifyProviderError(402, '{}', ctx);
    const byMessage = classifyProviderError(500, body, ctx);

    for (const error of [byStatus, byMessage]) {
      expect(error.code).toBe('AUTH_ERROR');
      // The distinction that matters: retrying this is pointless.
      expect(error.retryable).toBe(false);
    }
  });

  // A rate limit clears on its own; an empty account does not. Conflating them
  // would either retry forever or disable a provider that was only throttled.
  it('keeps a rate limit distinct from an unpayable account', () => {
    const throttled = classifyProviderError(429, '{}', ctx);
    expect(throttled.code).toBe('RATE_LIMITED');
    expect(throttled.retryable).toBe(true);
  });

  // Observed live: Groq's 413 for an oversized request ends with
  // "Upgrade to Dev Tier today at https://console.groq.com/settings/billing".
  // Matching the word "billing" anywhere turned a transient size error into a
  // permanent credential failure and took a healthy provider out of rotation.
  it('does not read a billing link in an error body as a billing failure', () => {
    const body = JSON.stringify({
      error: {
        message:
          'Request too large for model `x` on tokens per minute (TPM): Limit 8000, ' +
          'Requested 8271, please reduce your message size and try again. ' +
          'Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing',
        code: 'rate_limit_exceeded',
      },
    });

    const error = classifyProviderError(413, body, ctx);
    expect(error.code).toBe('CONTEXT_TOO_LONG');
    expect(error.code).not.toBe('AUTH_ERROR');
  });

  it('still reads a throttle as a throttle when the body mentions an account', () => {
    const body = JSON.stringify({ error: { message: 'Rate limit reached for your account' } });
    expect(classifyProviderError(429, body, ctx).code).toBe('RATE_LIMITED');
  });

  // The narrow matcher must not turn an ordinary bad request into an auth
  // failure just because the user's prompt mentioned the words.
  it('does not misread a prompt that merely mentions API keys', () => {
    const body = JSON.stringify({
      error: { message: 'Unsupported value for parameter response_format.' },
    });
    expect(classifyProviderError(400, body, ctx).code).toBe('INVALID_REQUEST');
  });

  it('distinguishes context overflow from a malformed request', () => {
    const body = JSON.stringify({ error: { message: 'This model’s maximum context length is 8192 tokens.' } });
    expect(classifyProviderError(400, body, ctx).code).toBe('CONTEXT_TOO_LONG');
  });

  it('marks rate limiting and upstream outages retryable', () => {
    expect(classifyProviderError(429, '{}', ctx).retryable).toBe(true);
    expect(classifyProviderError(503, '{}', ctx).retryable).toBe(true);
  });

  // The upstream body can contain provider internals. It belongs in the log,
  // never in what the user is shown.
  it('keeps the upstream body out of the user-facing message', () => {
    const secretish = 'org-internal-trace: abcdef; key suffix ...9f2a';
    const error = classifyProviderError(500, secretish, ctx);
    expect(error.userMessage).not.toContain('abcdef');
    expect(error.userMessage).not.toContain('9f2a');
  });
});

describe('classifyTransportError', () => {
  it('separates our own cancellation from a timeout', () => {
    const abort = new AbortController();
    abort.abort();
    const aborted = new DOMException('aborted', 'AbortError');

    expect(classifyTransportError(aborted, abort.signal, ctx).code).toBe('CANCELLED');
    expect(classifyTransportError(aborted, new AbortController().signal, ctx).code).toBe('TIMEOUT');
  });

  it('classifies socket-level failures as network errors', () => {
    const error = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    expect(classifyTransportError(error, new AbortController().signal, ctx).code).toBe(
      'NETWORK_ERROR',
    );
  });
});

describe('a plan restriction is not a rejected credential', () => {
  // Observed live against Mistral on a free account, for mistral-large-latest.
  const TIER = JSON.stringify({
    object: 'error',
    message: 'This model is not allowed for your tier.',
    type: 'tier_not_allowed',
    code: '3505',
  });

  it('classifies Mistral’s 403 tier_not_allowed as a model problem', () => {
    const error = classifyProviderError(403, TIER, {});
    expect(error.code).toBe('MODEL_NOT_FOUND');
  });

  it('does not mark the credential rejected, so the provider stays routable', () => {
    // The damage the old classification did: `AUTH_ERROR` takes the whole
    // provider out of rotation for fifteen minutes (ADR-016). One model being
    // outside the plan is no reason to stop calling the others, and no amount
    // of waiting or re-keying changes it.
    const error = classifyProviderError(403, TIER, {});
    expect(error.code).not.toBe('AUTH_ERROR');
    expect(error.retryable).toBe(false);
  });

  it('still treats a bare 403 as an auth failure', () => {
    // Only a recognised restriction marker diverts; anything else is still the
    // credential being refused.
    expect(classifyProviderError(403, 'Forbidden', {}).code).toBe('AUTH_ERROR');
    expect(classifyProviderError(401, 'Unauthorized', {}).code).toBe('AUTH_ERROR');
  });

  it('does not misread a body that merely discusses plans', () => {
    // Same discipline as the billing-link case: narrow markers only.
    const chatter = 'Your plan includes access to many tiers of service.';
    expect(classifyProviderError(403, chatter, {}).code).toBe('AUTH_ERROR');
  });

  it('keeps the upstream body out of the user-facing message', () => {
    const error = classifyProviderError(403, TIER, {});
    expect(error.message).not.toMatch(/tier_not_allowed|3505/);
  });
});
