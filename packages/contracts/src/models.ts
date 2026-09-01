import { z } from 'zod';

export const Availability = z.enum([
  'AVAILABLE',
  'UNKNOWN',
  'TEMPORARILY_UNAVAILABLE',
  'CONFIGURED_BUT_UNAVAILABLE',
  'NOT_CONFIGURED',
  'DISABLED',
  'DEPRECATED',
]);
export type Availability = z.infer<typeof Availability>;

/** True when a model can actually be sent a request right now. */
export function isRoutable(availability: Availability): boolean {
  return availability === 'AVAILABLE' || availability === 'UNKNOWN';
}

export const Capabilities = z.object({
  reasoning: z.boolean(),
  vision: z.boolean(),
  audio: z.boolean(),
  video: z.boolean(),
  documents: z.boolean(),
  toolCalling: z.boolean(),
});
export type Capabilities = z.infer<typeof Capabilities>;

export const Provider = z.object({
  id: z.string(),
  displayName: z.string(),
});
export type Provider = z.infer<typeof Provider>;

/**
 * The wire shape of a model. Routing internals — quality/speed/cost tiers and
 * rank — are deliberately absent: publishing them invites users to reverse
 * engineer the router and turns a calm product into a configuration surface.
 */
export const Model = z.object({
  id: z.string(),
  provider: Provider,
  displayName: z.string(),
  description: z.string(),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  capabilities: Capabilities,
  availability: Availability,
  availabilityReason: z.string().nullable(),
  deprecated: z.boolean(),
});
export type Model = z.infer<typeof Model>;

export const ModelsResponse = z.object({
  models: z.array(Model),
  /** False when no real model is configured. Drives the disabled composer. */
  auto: z.object({ available: z.boolean() }),
  checkedAt: z.string(),
});
export type ModelsResponse = z.infer<typeof ModelsResponse>;
