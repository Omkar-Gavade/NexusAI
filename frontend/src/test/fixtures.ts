import type { Model, ModelsResponse } from '@nexusai/contracts';
import type { ModelSlot } from '@/features/chat/stream-reducer';

/**
 * Test inputs only. Nothing here is rendered by the application — the product
 * shows what the backend returns, and shows nothing when it returns nothing.
 */
export function slot(overrides: Partial<ModelSlot> & { id: string }): ModelSlot {
  const { id, ...rest } = overrides;
  return {
    model: { modelId: id, provider: 'test', displayName: id },
    phase: 'complete',
    text: `Answer from ${id}`,
    outcome: 'complete',
    stance: 'concurs',
    latencyMs: 1200,
    inputTokens: 10,
    outputTokens: 20,
    errorCode: null,
    errorMessage: null,
    ...rest,
  };
}

export function model(overrides: Partial<Model> & { id: string }): Model {
  return {
    provider: { id: 'test-provider', displayName: 'Test Provider' },
    displayName: overrides.id,
    description: '',
    contextWindow: 200_000,
    maxOutputTokens: 8192,
    capabilities: {
      reasoning: false,
      vision: false,
      audio: false,
      video: false,
      documents: false,
      toolCalling: false,
    },
    availability: 'AVAILABLE',
    availabilityReason: null,
    deprecated: false,
    ...overrides,
  };
}

export function catalog(models: Model[]): ModelsResponse {
  return {
    models,
    auto: { available: models.some((m) => m.availability === 'AVAILABLE') },
    checkedAt: new Date().toISOString(),
  };
}
