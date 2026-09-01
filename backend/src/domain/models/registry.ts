import { isRoutable, type Model, type ModelRef, type RoutingMode } from '@nexusai/contracts';
import type { Config } from '../../config/env.ts';
import type { ProviderAdapter } from '../../infrastructure/llm/adapter.ts';
import { CATALOG, type ModelDefinition } from './catalog.ts';
import { ProviderHealthTracker } from './health.ts';

/** How many models each routing mode fans out to, before config clamps it. */
const FANOUT: Record<RoutingMode, number> = { single: 1, balanced: 3, thorough: 5 };

export class ModelRegistry {
  readonly health = new ProviderHealthTracker();

  private readonly definitions: readonly ModelDefinition[];

  constructor(
    private readonly config: Config,
    private readonly adapters: ReadonlyMap<string, ProviderAdapter>,
  ) {
    // A test-only model must not exist in the catalog at all when disabled —
    // filtered once, here, rather than guarded at every call site.
    this.definitions = CATALOG.filter(
      (m) => !m.testOnly || config.TEST_PROVIDER_ENABLED,
    ).toSorted((a, b) => a.rank - b.rank);
  }

  find(modelId: string): ModelDefinition | undefined {
    return this.definitions.find((m) => m.id === modelId);
  }

  adapterFor(model: ModelDefinition): ProviderAdapter | undefined {
    return this.adapters.get(model.provider);
  }

  isConfigured(model: ModelDefinition): boolean {
    return this.adapters.get(model.provider)?.isConfigured() ?? false;
  }

  availabilityOf(model: ModelDefinition) {
    if (model.deprecated) return 'DEPRECATED' as const;
    return this.health.availability(model.provider, this.isConfigured(model));
  }

  /** Models that can actually be sent a request right now. */
  routable(): ModelDefinition[] {
    return this.definitions.filter((m) => isRoutable(this.availabilityOf(m)));
  }

  /**
   * Fan-out selection: the highest-quality routable models, returned in rank
   * order so the provenance rail's positions stay stable across turns.
   */
  select(mode: RoutingMode): ModelDefinition[] {
    const limit = Math.min(FANOUT[mode], this.config.MAX_MODELS_PER_REQUEST);
    return this.routable()
      .toSorted((a, b) => b.quality - a.quality || a.rank - b.rank)
      .slice(0, limit)
      .toSorted((a, b) => a.rank - b.rank);
  }

  /** Who writes the synthesis: the best routable model that can do it. */
  synthesisModel(exclude: readonly string[] = []): ModelDefinition | undefined {
    return this.routable()
      .filter((m) => m.synthesisCapable && !exclude.includes(m.id))
      .toSorted((a, b) => b.quality - a.quality || a.rank - b.rank)
      .at(0);
  }

  ref(model: ModelDefinition): ModelRef {
    return { modelId: model.id, provider: model.provider, displayName: model.displayName };
  }

  /**
   * The wire shape. Routing internals — quality, speed, rank, the provider's
   * own model id — are deliberately absent.
   */
  toWire(): Model[] {
    return this.definitions.map((model) => {
      const availability = this.availabilityOf(model);
      return {
        id: model.id,
        provider: { id: model.provider, displayName: model.providerDisplayName },
        displayName: model.displayName,
        description: model.description,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        capabilities: model.capabilities,
        availability,
        availabilityReason: this.health.reason(availability),
        deprecated: model.deprecated,
      };
    });
  }

  /** False disables the composer in the frozen client. It must be accurate. */
  autoAvailable(): boolean {
    return this.routable().length > 0;
  }
}
