# ADR-014 — Synthesis strategy, and how stance is measured

Status: **Accepted** · 2026-08-28

## Context

The product's claim is that several models are *reconciled* into one answer, and
that the reader can see which models agreed. Two things had to be decided:
how the synthesis is produced, and where `Stance` (`concurs` / `diverges` /
`unknown`) actually comes from.

Stance is rendered on the provenance rail as fact. Inventing it — by text
similarity, by majority vote, by assuming agreement — would put a fabricated
claim on screen, which is the one thing this product must never do.

## Decision

**Synthesis is a separate model pass.** The highest-quality routable model with
`synthesisCapable` receives the original question plus every successful model
response, delimited and explicitly framed as data rather than instructions. It
is asked to reconcile, to state disagreement rather than silently pick a side,
and to attribute or omit uncorroborated claims. Instructions live in
`domain/synthesis/prompt.ts`, versioned by `SYNTHESIS_PROMPT_VERSION`, and are
never returned to a user.

**Stance is judged by the synthesiser, in-band.** Before the prose it emits a
delimited verdict block classifying each contributing model against the answer
it is about to write. The orchestrator withholds the stream until that block
closes, parses it, emits `agreement`, and only then begins streaming prose — so
the block never reaches the reader.

**Anything unparsed stays `unknown`.** A missing block, a malformed line, or a
model that failed means no stance is assigned. `concur + diverge` is therefore
allowed to be less than `responded`.

## Alternatives considered

- **Text-similarity scoring.** Deterministic and cheap, but similarity is not
  agreement: two responses can be worded alike and conclude oppositely.
- **Majority vote.** Counts opinions rather than reconciling them, and the
  product's whole argument is that reconciliation is the valuable part.
- **A second classification call per model.** N extra paid calls to learn what
  the synthesiser already had to determine while reconciling.
- **Assuming concurrence by default.** Rejected outright — it is the fabrication
  this design exists to prevent.

## Consequences

- **Synthesis failure is a failure.** If no model returns usable text, or the
  synthesis pass fails, the turn ends in `SYNTHESIS_FAILED`. There is no
  fallback that quietly promotes one model's response to "the answer" — that
  would misattribute authorship.
- **`unknown` is a normal outcome, not an error.** It exposed a real defect at
  the seam: the frozen client read `diverge === 0` as unanimity and announced
  "ALL CONCUR" for turns where nothing had been classified. Fixed in
  `frontend/src/lib/format.ts`, with regression tests.
- **Latency is additive**: the fan-out completes before synthesis begins. The
  per-model calls are concurrent; the synthesis pass is not overlapped with them
  because it needs all of their output.
- **Sources are always empty.** No adapter extracts them and none is fabricated.
  The `sources` event is emitted with an empty list so the client's state is
  explicit rather than absent.
