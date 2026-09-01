/**
 * The models the product is built around.
 *
 * These names are the catalog's, copied from `backend/src/domain/models/
 * catalog.ts` — the same `displayName` and `providerDisplayName` the workspace
 * renders in its model selector. They are duplicated here rather than imported
 * because the catalog is backend-only and the marketing page must not pull the
 * server's routing internals (quality, rank, upstream ids) into a public
 * bundle. A test asserts the two lists agree, so the duplication cannot drift
 * silently.
 *
 * No availability is claimed. Whether a given provider is reachable depends on
 * the deployment's configuration and on the provider itself, and the workspace
 * reports that per model at request time. Printing "available" on a marketing
 * page would be asserting something this page cannot know.
 */

/* eslint-disable no-restricted-syntax --
 * The rule forbids hardcoded provider identifiers so that product UI cannot
 * assert a provider the server does not have; the workspace reads them from
 * `/api/models` at request time and that must stay true.
 *
 * This is a different claim on a different surface. A public page has no
 * session and cannot call an authenticated endpoint, and what it states is
 * "the software integrates these providers", not "this provider is available
 * to you". No availability is printed here, and the copy below says so.
 *
 * The rule's real concern — a list that drifts from the catalog — is handled
 * by `model-roster.test.ts`, which fails if these names stop matching
 * `backend/src/domain/models/catalog.ts`.
 */
export const ROSTER = [
  { provider: 'OpenAI', model: 'GPT-4o' },
  { provider: 'Anthropic', model: 'Claude Sonnet 4.5' },
  { provider: 'Google', model: 'Gemini 2.5 Flash' },
  { provider: 'Mistral', model: 'Mistral Large' },
  { provider: 'DeepSeek', model: 'DeepSeek V4 Flash' },
  { provider: 'Groq', model: 'GPT-OSS 120B' },
] as const;

export function ModelRoster() {
  return (
    <div>
      <ul className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3">
        {ROSTER.map((entry) => (
          <li key={entry.model} className="bg-canvas px-4 py-4">
            <span data-register="machine" className="text-note uppercase text-ink-3">
              {entry.provider}
            </span>
            <p className="mt-1.5 text-ui font-[550] text-ink">{entry.model}</p>
          </li>
        ))}
      </ul>

      <p className="mt-5 max-w-[62ch] text-ui text-ink-2">
        A deployment enables a model by holding that provider’s credential. Anything
        unconfigured reports itself as unavailable rather than failing when you ask, and the
        workspace shows that state per model before you send.
      </p>
    </div>
  );
}
