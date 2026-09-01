import { z } from 'zod';
import { ErrorCode } from './error.ts';
import { RoutingMode } from './auth.ts';
import { Agreement, ModelOutcome, ModelRef, Source, Stance } from './message.ts';

export const MESSAGE_MAX_CHARS = 32_000;

export const ChatSelection = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto'), routing: RoutingMode }),
  z.object({ mode: z.literal('manual'), modelId: z.string().min(1).max(80) }),
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

/**
 * The stream protocol.
 *
 * Per-model text is NOT streamed. Models emit `model_start` so the Provenance
 * Rail can show them in flight, then `model_complete` carrying the full text.
 * Only the synthesis streams token by token, because four columns of racing
 * text is a slot machine, and shipping every model's tokens costs four times
 * the bandwidth for output the user cannot read yet.
 */
export const ChatEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    conversationId: z.string(),
    messageId: z.string(),
    /** Fixed order for the life of the message. Position identifies a model. */
    plan: z.array(ModelRef),
    mode: z.enum(['auto', 'manual']),
  }),

  z.object({ type: z.literal('model_start'), modelId: z.string() }),

  z.object({
    type: z.literal('model_complete'),
    modelId: z.string(),
    text: z.string(),
    outcome: ModelOutcome,
    latencyMs: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
  }),

  z.object({
    type: z.literal('model_error'),
    modelId: z.string(),
    code: ErrorCode,
    message: z.string(),
  }),

  z.object({ type: z.literal('synthesis_start'), model: ModelRef }),

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
