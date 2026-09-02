import { AppError, Errors } from '../../domain/errors.ts';

/**
 * Markers a provider uses to say "this credential is wrong" while returning a
 * status that does not say so. Deliberately narrow: a prompt that merely talks
 * about API keys must not be misread as an auth failure.
 */
const INVALID_KEY = /api[_ ]key[_ ]invalid|api key not valid|invalid[_ ]api[_ ]key|unauthenticated/;

/**
 * The account behind the credential cannot serve requests until someone pays.
 * Distinct from a rate limit, which clears on its own.
 *
 * Deliberately specific phrases, and notably NOT a bare "billing": provider
 * error bodies routinely link to a billing page from errors that have nothing
 * to do with billing. Groq's 413 for an oversized request ends with
 * "Upgrade to Dev Tier today at .../settings/billing", and matching that word
 * turned a transient size error into a permanent credential failure that took
 * the provider out of rotation.
 */
const ACCOUNT_UNUSABLE =
  /insufficient[_ ](balance|quota|credit|funds)|payment required|exceeded your current quota|account (is )?(suspended|deactivated)/;

/**
 * A 403 the operator cannot fix by presenting a different credential: the key
 * is valid and accepted, this model simply is not in the account's plan.
 *
 * Observed live: Mistral answers `{"type":"tier_not_allowed"}` for
 * `mistral-large-latest` on a free account. Classified as an auth failure it
 * did real damage — `providerAuthError` marks the credential rejected, which
 * takes the *whole provider* out of rotation for fifteen minutes (ADR-016).
 * One model being outside the plan is not a reason to stop calling the other
 * models on that provider, and no amount of waiting or re-keying changes it.
 *
 * Kept narrow for the same reason the credential markers are: a body that
 * merely discusses plans or tiers must not be read as a restriction.
 */
const PLAN_RESTRICTED =
  /tier[_ ]not[_ ]allowed|model[_ ]not[_ ]allowed|not allowed to use|plan does not (include|allow)|not (subscribed|entitled) to/;

/**
 * Upstream failure → internal error, in one place.
 *
 * The upstream body is attached to `context` (logged) and never to
 * `userMessage` (returned), so a provider's internal detail cannot reach a
 * user through a path nobody remembered to sanitise.
 */
export function classifyProviderError(
  status: number,
  body: string,
  context: Record<string, unknown>,
): AppError {
  const ctx = { ...context, upstreamStatus: status, upstreamBody: body.slice(0, 500) };
  const lower = body.toLowerCase();

  if (status === 400) {
    // Google's Generative Language API reports a rejected key as 400
    // INVALID_ARGUMENT / API_KEY_INVALID rather than 401. Verified against the
    // live endpoint. Without this it classifies as a non-retryable request
    // error, which never sets `authFailed` — so a deployment with a wrong key
    // would keep advertising the model as selectable and keep calling the
    // provider on every turn, with nothing ever reporting the real cause.
    if (INVALID_KEY.test(lower)) return Errors.providerAuthError(ctx);

    // Context overflow is reported as a plain 400 by most providers; the body
    // is the only way to tell it apart from a malformed request.
    if (/token|context|too long|maximum length/.test(lower)) return Errors.contextTooLong();
    return Errors.invalidProviderRequest(ctx);
  }
  if (status === 401) return Errors.providerAuthError(ctx);
  if (status === 403) {
    // A plan restriction is about the model, not the credential. Reporting it
    // as MODEL_NOT_FOUND keeps the provider healthy and the other models on it
    // routable, which is the whole difference this branch exists to make.
    return PLAN_RESTRICTED.test(lower) ? Errors.modelNotFound(ctx) : Errors.providerAuthError(ctx);
  }

  // 402, and the equivalent said in words at another status. Observed live:
  // DeepSeek answers "Insufficient Balance" with 402, which fell through to the
  // generic retryable provider error — so the orchestrator would have retried a
  // failure that can never succeed, on every turn, while the model stayed
  // advertised as available. Classified as an auth failure because the
  // consequence is identical: an operator must act, and until they do the
  // provider is unusable. The 15-minute re-check means topping the account up
  // recovers it without a restart.
  // Ordered before the account check so a throttle that mentions an account
  // state is still read as a throttle: one clears on its own, the other needs
  // an operator, and treating the first as the second disables a healthy
  // provider.
  if (status === 429) return Errors.rateLimited(30);

  // Request larger than the provider will accept — including a per-minute token
  // ceiling, which providers report against the request rather than the window.
  if (status === 413) return Errors.contextTooLong();

  if (status === 402 || ACCOUNT_UNUSABLE.test(lower)) return Errors.providerAuthError(ctx);
  if (status === 404) return Errors.modelNotFound(ctx);
  if (status === 422 && /safety|policy|blocked|content/.test(lower))
    return Errors.contentPolicy(ctx);
  if (status === 503) return Errors.providerUnavailable(ctx);
  if (status >= 500) return Errors.providerError(ctx);

  return Errors.providerError(ctx);
}

/** Transport-level failure, before any HTTP status exists. */
export function classifyTransportError(
  error: unknown,
  signal: AbortSignal,
  context: Record<string, unknown>,
): AppError {
  if (error instanceof AppError) return error;

  const name = error instanceof Error ? error.name : '';
  const code = (error as { cause?: { code?: string } })?.cause?.code ?? '';

  if (name === 'AbortError' || name === 'TimeoutError') {
    // Our own cancellation and a timeout both surface as AbortError; only the
    // signal can tell them apart.
    return signal.aborted ? Errors.cancelled() : Errors.timeout(context);
  }
  if (['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'].includes(code)) {
    return Errors.networkError({ ...context, code });
  }
  return Errors.networkError({ ...context, error: String(error).slice(0, 300) });
}
