# NexusAI — Product Overview

Status: **CURRENT (v2.0)** · Updated 2026-08-19

The v1.0 single-model product description is preserved at
[legacy/v1-single-model-product.md](legacy/v1-single-model-product.md). Its UX
flows, error copy and state design still apply; its scope does not.

---

## 1. What NexusAI is

A conversational workspace that asks **several models the same question**,
reconciles their answers into **one synthesis**, and exposes the individual
responses as **provenance** you can inspect.

The value is not the number of models. Any product can call four APIs and render
four columns — that hands the reader the hard part. NexusAI does the
reconciliation before you read anything, and then shows its working.

```text
one prompt
   ↓
several models, in parallel
   ↓
compared against each other
   ↓
one synthesis          ← this is the answer
   ↓
provenance rail        ← who contributed, who diverged
   ↓
model responses · sources   ← evidence, one gesture away
```

## 2. Why it exists

A single model gives one opinion with no signal about how much of it to trust.
Two models rarely fail the same way on the same question, so **where they
diverge is information about the question**. Agreement between independent
models is worth more than one confident answer — and neither is visible if you
only ever ask once.

The alternative is doing it manually: four tabs, four answers, and a
reconciliation task the user did not ask for.

## 3. Product principles

1. **Synthesis is the answer.** It sits in the reading column at full measure
   with no container. Model responses are quieter — 13px on a raised surface
   against 16px on the canvas. Evidence must not compete with the conclusion.
2. **Provenance is a first-class interaction**, not a debug panel. Every rail
   segment is a real, keyboard-reachable control.
3. **Nothing displayed is estimated.** Model names, latency and agreement counts
   are measured. There are no confidence percentages anywhere, because nothing
   computes one.
4. **Failures are stated.** If a model does not answer, its rail segment renders
   hollow and the metadata says how many actually responded.
5. **No vendor colour.** Models are distinguished by position and neutral
   density. The interface is not an aggregator of other companies' brands.

## 4. Current surfaces

| Surface | State |
|---|---|
| Public home `/` | Built — positioning, how it works, provenance, capabilities |
| Auth `/login` `/register` | Built — validation, loading, errors, keyboard, autocomplete |
| Workspace shell `/app` | Built — sidebar, header, drawer, dialogs, toasts, shortcuts |
| Chat `/app/chat/:id` | Built — composer, streaming, history, scroll anchoring |
| Synthesis | Built — streamed, markdown, code blocks, tables |
| Provenance rail | Built — position, density, divergence notch, failure state |
| Comparison | Built — collapsed disclosure, per-model panes |
| Sources | Built — list, external links, honest empty state |
| Search | Built — **local, title-only, over loaded conversations** |
| Settings | Built — theme, account read, sign out |

Full detail, including what is only specified:
[capability-matrix.md](capability-matrix.md).

## 5. Backend status

**No backend exists in this repository.**

Every API call returns an error today. The frontend renders real degraded states
rather than mock data — that is Rule 1 applied to the development state as much
as to production. Nothing is stubbed, nothing is faked, and no response is
fabricated to make a screen look finished.

What the client expects is documented in
[backend/README.md](../../backend/README.md) and typed in
`packages/contracts`.

## 6. Planned

Not built, not advertised as available: **projects**, **knowledge**,
**attachments** (tray exists, no upload endpoint), **inline citation markers**,
**message pagination**, **desktop side panel**, **mobile comparison tabs**.

## 7. Related

- [Routes & information architecture](routes.md)
- [Capability matrix](capability-matrix.md)
- [Design language](../design/language.md) · [Components](../design/components.md)
- [Frontend architecture](../frontend/architecture.md)
- [Decisions](../decisions/)

## The public page

The landing page is one argument, in order: a single model gives one reading of
a question; several give a comparison; the comparison is only worth anything if
disagreement survives it; and the answer is only checkable if the working is
visible. Twelve sections, each carrying one step.

Every product illustration on it — the hero orchestration frame, the divergent
readings, the synthesis flow, the degraded turn — is drawn in the product's own
notation rather than screenshotted, and each is captioned as static. The
agreement counts they display are produced by the application's own
`agreementSentence`, so the page cannot state a count the workspace would not.

The pre-launch position is stated in the hero, not buried: model execution is
not yet running for the public product, and the capabilities table marks
`Sources`, `Attachments`, `Projects` and `Knowledge` as planned rather than
built. `home-page.test.tsx` fails the build on unsupported claims — invented
statistics, customer counts, superlatives, guarantees, or any wording that
implies a running service.
