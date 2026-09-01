# ADR-018 — Sources remain planned, and the empty event stays

Status: **Accepted** · 2026-08-28

## Context

The product shows a Sources list under an answer, the contract defines a
`Source`, the stream emits a `sources` event, and the capability matrix has
marked sources as planned since the frontend was built. Phase 4 asked whether
they can now be implemented honestly.

The contract's shape settles it:

```ts
Source = { index, title, url, domain, snippet, retrievedAt }
```

`snippet` and `retrievedAt` describe **a document that was fetched**. They are
not properties of a model's answer; they are properties of a retrieval. Nothing
in this system retrieves anything: every adapter sends a plain chat-completions
request with `messages` and an output cap, and no request carries a web-search
or grounding tool.

So there are exactly three ways to fill that shape:

1. **Enable provider-side grounding** — OpenAI's web search tool, Gemini's
   Google Search grounding, Anthropic's web search tool. Each returns real
   retrieved documents with real URLs.
2. **Retrieve ourselves** — a search API, a crawler, a RAG pipeline.
3. **Infer sources from the answer text** — scrape URLs out of the prose and
   present them as sources.

## Decision

**Sources stay planned. The `sources` event continues to be emitted with an
empty list.**

Option 3 is refused outright and permanently. A URL a model wrote in prose is
not a source: nobody fetched it, so there is no snippet and no retrieval time,
and the model may well have invented the URL. Presenting it in a source card
asserts provenance that does not exist — the precise failure this product is
built to avoid. `tests/integration/sources.test.ts` guards it, including the
case where a response is dense with URLs and citation markers.

Option 2 is out of scope by standing instruction, and is a different product
capability rather than a gap in this one.

Option 1 is the honest route and the one to take when sources are built, but it
is a feature, not a verification task: it changes the request shape per
provider, adds material cost and latency, needs its own availability semantics
for models that cannot ground, and cannot be verified at all without provider
credentials. Building it now would mean writing three provider-specific
retrieval paths that have never executed — the exact pattern that produced the
defects found in Phase 3.

The event is emitted empty rather than omitted so the client renders a known
"no sources" state rather than an absent one.

## Consequences

- The capability matrix keeps sources as `Planned`, and the landing page keeps
  describing them in the future tense.
- Inline citation markers stay unimplemented too: a marker pointing at a source
  that does not exist is worse than no marker.
- When sources are built, provider grounding is the starting point, and the
  first question is which catalog models support it — availability must not
  claim grounding for a model that cannot do it.
- The `Source` contract needs no change; it already describes the right thing.
