import { z } from 'zod';
import { ErrorCode } from './error.ts';

export const MessageRole = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof MessageRole>;

/**
 * `streaming` is a server-side only state. The read path maps it to `failed`
 * before it reaches a client, so a message interrupted by a process death is
 * never presented as if it were still in flight.
 */
export const MessageStatus = z.enum([
  'complete',
  'cancelled',
  'failed',
  'failed_partial',
]);
export type MessageStatus = z.infer<typeof MessageStatus>;

export const ModelRef = z.object({
  modelId: z.string(),
  provider: z.string(),
  displayName: z.string(),
});
export type ModelRef = z.infer<typeof ModelRef>;

export const ModelOutcome = z.enum(['complete', 'failed', 'empty', 'cancelled']);
export type ModelOutcome = z.infer<typeof ModelOutcome>;

/**
 * Whether a model's answer agrees with the synthesis. `unknown` is used when the
 * model failed or when the synthesis pass could not classify it — it is never
 * guessed, because the Provenance Rail renders it as fact.
 */
export const Stance = z.enum(['concurs', 'diverges', 'unknown']);
export type Stance = z.infer<typeof Stance>;

export const ModelResponse = z.object({
  model: ModelRef,
  text: z.string(),
  outcome: ModelOutcome,
  stance: Stance,
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  errorCode: ErrorCode.nullable(),
});
export type ModelResponse = z.infer<typeof ModelResponse>;

export const Agreement = z.object({
  /** Models that actually returned an answer. Never the number requested. */
  responded: z.number().int().nonnegative(),
  requested: z.number().int().nonnegative(),
  concur: z.number().int().nonnegative(),
  diverge: z.number().int().nonnegative(),
});
export type Agreement = z.infer<typeof Agreement>;

export const Source = z.object({
  index: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  snippet: z.string(),
  retrievedAt: z.string(),
});
export type Source = z.infer<typeof Source>;

export const MessageMetadata = z.object({
  latencyMs: z.number().int().nonnegative(),
  firstTokenMs: z.number().int().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
});
export type MessageMetadata = z.infer<typeof MessageMetadata>;

export const Message = z.object({
  id: z.string(),
  role: MessageRole,
  /** For an assistant message this is the synthesis, not any single model. */
  content: z.string(),
  status: MessageStatus,
  synthesisModel: ModelRef.nullable(),
  responses: z.array(ModelResponse),
  agreement: Agreement.nullable(),
  sources: z.array(Source),
  metadata: MessageMetadata.nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof Message>;

export const MessageListResponse = z.object({
  messages: z.array(Message),
  nextCursor: z.string().nullable(),
});
export type MessageListResponse = z.infer<typeof MessageListResponse>;
