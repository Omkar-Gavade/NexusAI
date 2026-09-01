# AI Quality Evaluation

Status: **CURRENT** · Updated 2026-08-28 — first real evaluation performed

## Result

**A qualitative smoke evaluation was run against real providers.** Seven
categories, one turn each, three models per turn (Gemini 2.5 Flash, Mistral
Large, GPT-OSS 120B on Groq), synthesis by whichever model the registry ranked
highest at the time.

**This is not a benchmark.** Seven prompts cannot support a score, and none is
given. What follows is what was observed.

### What synthesis did well

**Ambiguity was the clearest result.** Asked "How long is a game of football?",
Groq answered about the NFL while Mistral and Gemini answered about association
football. The synthesis did not pick a side or average them: it named both
codes and gave the duration of each, and the verdict marked Mistral as
`diverges`. That is the product's thesis working on a real disagreement it was
not told about in advance.

**Uncertainty survived.** Asked for world population in 2150, the models gave
different figures — one cited the UN medium-variant 9.7 billion, another gave a
range. The synthesis reported the range and said the projection is inherently
uncertain rather than choosing the most confident-sounding number.

**Agreement was stated once.** Both responders said water boils at 100°C; the
synthesis said it once, without padding or false hedging.

### What the evaluation exposed

Two of the seven turns produced **no answer at all**. The models responded, and
then the synthesis call was rate-limited, so the turn errored and three
successful responses were discarded. That was a real defect, not a provider
problem — the orchestrator selected one synthesis model and never tried
another, even though the registry had supported exclusion since it was written.
Fixed, with failover; see `tests/integration/synthesis-stream.test.ts`.

### Limitations, stated plainly

- **Seven prompts, one run each.** No repetition, so nothing here separates
  model behaviour from run-to-run variance.
- **Three models, none from OpenAI or Anthropic** — no key was available for
  either, so the two most widely used providers are absent from every result.
- **The synthesist was usually also a contributor**, and rated itself
  `concurs`. That is what ADR-014 specifies, but it is worth knowing when
  reading a stance.
- **Free-tier accounts.** Rate limits shaped the results as much as model
  quality did.
- No factuality scoring, no inter-rater agreement, no held-out set. Treat every
  statement above as an observation, not a measurement.

## Phase 8 re-confirmation

The failover fix that this evaluation produced was later observed working
against real providers, unprompted: on a Phase 8 turn the synthesis model
(Gemini) was rate-limited, the orchestrator failed over to Mistral, and the turn
completed with a correct answer instead of discarding two models' work. That is
the defect below, closed and demonstrated in production conditions.

The same run is a caution about provider coverage rather than about the
pipeline: two of three models failed for account reasons — Gemini throttled,
DeepSeek unpayable — so a "multi-model" answer was written from one response.
The system reported `one of three responded` truthfully. It is still one model.

## Categories

A **qualitative smoke evaluation**, not a benchmark. Small, synthetic, and
deliberately cheap. It will not produce a score, because a handful of prompts
cannot support one.

Seven categories, chosen because each one stresses a different part of the
synthesis contract:

| Category | What it probes | Failure to look for |
|---|---|---|
| Agreement | Models likely converge | Synthesis manufactures disagreement to look balanced |
| Disagreement | Models likely diverge | Synthesis silently picks a side, or averages them into mush |
| Ambiguity | Question has several readings | Synthesis commits to one reading without flagging it |
| Uncertainty | Answer is not knowable | Synthesis asserts a confident answer |
| One-model error | One model is likely wrong | Synthesis follows the majority instead of the evidence |
| Conflicting reasoning | Same conclusion, different routes | Synthesis reports agreement it did not verify |
| Missing information | Question lacks a needed fact | Synthesis fabricates the missing fact |

For each case, record: the prompt, each model's outcome, the synthesis, the
stance per model, `agreement.responded`, and whether provenance matched what
actually executed.

The four questions that decide whether synthesis is working:

1. Does the answer reflect **more than one** response, or is it one model's
   answer restated?
2. When models genuinely disagree, does it say so rather than smoothing over it?
3. Does uncertainty survive, or does reconciliation manufacture confidence?
4. Does the stance in the rail match what the responses actually said?

## Rules for reporting it

- Call it a qualitative or smoke evaluation. **Not** a benchmark, unless a real
  dataset and methodology exist.
- No percentages, no accuracy figures, no "N% better".
- Report sample size and state plainly that it does not support generalisation.
- Record failures. An evaluation that finds nothing wrong across seven adversarial
  categories is more likely under-powered than proof of quality.
- Use synthetic prompts only. No real user content in this repository.

## Re-running it

```bash
PROVIDER_LIVE=1 pnpm --filter @nexusai/backend vitest run tests/manual/provider-live.test.ts
```

That must pass first. Only then is a quality evaluation measuring the product
rather than the plumbing.
