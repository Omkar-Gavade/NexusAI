import { z } from 'zod';
import { ErrorCode } from './error.ts';
import { RoutingMode } from './auth.ts';
import { Agreement, ModelOutcome, ModelRef, Source, Stance } from './message.ts';
import { RoutingDecision } from './routing.ts';

export const MESSAGE_MAX_CHARS = 32_000;

/**
 * Model Arena bounds, shared so the selector, the homepage composer and the
 * API enforce the same rule. Four is the most that stay readable side by side,
 * and every extra model is another paid call per question.
 */
export const ARENA_MIN_MODELS = 2;
export const ARENA_MAX_MODELS = 4;

/**
 * Distinct model ids, 2–4 of them. A duplicate is rejected rather than
 * silently collapsed: a client sending one is out of step with the server,
 * and quietly running fewer models than the reader picked misreports the turn.
 */
const ArenaModelIds = z
  .array(z.string().min(1).max(80))
  .min(ARENA_MIN_MODELS, `Select at least ${ARENA_MIN_MODELS} models to compare`)
  .max(ARENA_MAX_MODELS, `Select at most ${ARENA_MAX_MODELS} models to compare`)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Each model can be selected only once',
  });

export const ChatSelection = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto'), routing: RoutingMode }),
  z.object({ mode: z.literal('manual'), modelId: z.string().min(1).max(80) }),
  z.object({
    mode: z.literal('compare'),
    modelIds: ArenaModelIds,
  }),
]);
export type ChatSelection = z.infer<typeof ChatSelection>;

export const ChatRequest = z.object({
  conversationId: z.string().nullable(),
  message: z.string().trim().min(1).max(MESSAGE_MAX_CHARS),
  selection: ChatSelection,
  /** ULID. Reconciles the optimistic message and suppresses duplicate sends. */
  clientMessageId: z.string().length(26),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const SelectAnswerRequest = z.object({
  selectedModelId: z.string().min(1).max(80).nullable(),
});
export type SelectAnswerRequest = z.infer<typeof SelectAnswerRequest>;

export const SynthesizeMessageRequest = z.object({
  modelIds: ArenaModelIds.optional(),
});
export type SynthesizeMessageRequest = z.infer<typeof SynthesizeMessageRequest>;

/**
 * The stream protocol.
 *
 * Every model call streams on the server, so `model_complete` always carries a
 * measured `firstTokenMs`. What reaches the client while a model is writing
 * depends on the turn:
 *
 * - `compare` (Model Arena): `arena_delta` chunks per model, into its panel.
 * - one planned model (`manual`, or `auto` routed to one): `delta` chunks — the
 *   model's text *is* the answer, so it is shown as it is written.
 * - several planned models (`auto` synthesis): per-model text stays on the
 *   server; `model_start` / `model_complete` drive the Provenance Rail, then
 *   the synthesis streams as `delta`.
 */
export const ChatEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    conversationId: z.string(),
    messageId: z.string(),
    /** Fixed order for the life of the message. Position identifies a model. */
    plan: z.array(ModelRef),
    mode: z.enum(['auto', 'manual', 'compare']),
    routingDecision: RoutingDecision.nullable().optional(),
  }),

  z.object({ type: z.literal('model_start'), modelId: z.string() }),

  z.object({
    type: z.literal('arena_delta'),
    modelId: z.string(),
    text: z.string(),
  }),

  z.object({
    type: z.literal('model_complete'),
    modelId: z.string(),
    text: z.string(),
    outcome: ModelOutcome,
    latencyMs: z.number().int().nonnegative(),
    firstTokenMs: z.number().int().nonnegative().nullable().optional(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    estimatedCostUsd: z.number().nonnegative().nullable().optional(),
  }),

  z.object({
    type: z.literal('model_error'),
    modelId: z.string(),
    code: ErrorCode,
    message: z.string(),
  }),

  z.object({ type: z.literal('synthesis_start'), model: ModelRef }),

  z.object({ type: z.literal('synthesis_fallback') }),

  /** Synthesis text only. */
  z.object({ type: z.literal('delta'), text: z.string() }),

  z.object({
    type: z.literal('agreement'),
    agreement: Agreement,
    /** Per-model stance, keyed by model id. Absent models are `unknown`. */
    stances: z.record(z.string(), Stance),
  }),

  z.object({ type: z.literal('sources'), sources: z.array(Source) }),

  z.object({
    type: z.literal('complete'),
    messageId: z.string(),
    latencyMs: z.number().int().nonnegative(),
    firstTokenMs: z.number().int().nonnegative().nullable(),
  }),

  z.object({
    type: z.literal('error'),
    code: ErrorCode,
    message: z.string(),
    /** True when text was already emitted; the client keeps what it has. */
    partial: z.boolean(),
    requestId: z.string(),
  }),

  z.object({
    type: z.literal('cancelled'),
    messageId: z.string(),
    latencyMs: z.number().int().nonnegative(),
  }),
]);
export type ChatEvent = z.infer<typeof ChatEvent>;
export type ChatEventType = ChatEvent['type'];
