import type { ProviderAdapter, GenerationRequest, GenerationResult } from '../adapter.ts';
import { Errors, type AppError } from '../../../domain/errors.ts';

export type TestBehaviour =
  | { kind: 'succeed'; text?: string; delayMs?: number }
  | { kind: 'fail'; error: AppError }
  | { kind: 'empty' }
  | { kind: 'hang'; forMs: number };

/**
 * A deterministic, in-process adapter for development and tests.
 *
 * It is programmable rather than a generic mock, so a test can express "this
 * model times out while the others succeed" directly. It is never routable in
 * production: `TEST_PROVIDER_ENABLED` is refused there by config, and the
 * registry filters `testOnly` models out of the catalog.
 *
 * It returns clearly-labelled placeholder text. It never pretends to be a real
 * model answer.
 */
export class TestAdapter implements ProviderAdapter {
  readonly provider = 'test';

  private behaviours = new Map<string, TestBehaviour>();
  private streamBehaviours = new Map<string, TestBehaviour>();
  private defaultBehaviour: TestBehaviour = { kind: 'succeed' };

  /** Records which model ids were actually asked, for cancellation assertions. */
  readonly calls: string[] = [];
  /** Model ids whose call was aborted before completing. */
  readonly aborted: string[] = [];

  isConfigured(): boolean {
    return true;
  }

  program(modelId: string, behaviour: TestBehaviour): this {
    this.behaviours.set(modelId, behaviour);
    return this;
  }

  /**
   * Behaviour for `stream` only.
   *
   * The synthesis pass streams while the fan-out does not, and the synthesis
   * model is also one of the models in the plan. Without this, "synthesis
   * fails after the fan-out succeeded" — an ordinary production event when the
   * synthesis provider degrades mid-turn — cannot be expressed.
   */
  programStream(modelId: string, behaviour: TestBehaviour): this {
    this.streamBehaviours.set(modelId, behaviour);
    return this;
  }

  setDefault(behaviour: TestBehaviour): this {
    this.defaultBehaviour = behaviour;
    return this;
  }

  reset(): void {
    this.behaviours.clear();
    this.streamBehaviours.clear();
    this.defaultBehaviour = { kind: 'succeed' };
    this.calls.length = 0;
    this.aborted.length = 0;
  }

  async generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult> {
    const text = await this.run(request, signal);
    return {
      text,
      inputTokens: request.messages.reduce((n, m) => n + Math.ceil(m.content.length / 4), 0),
      outputTokens: Math.ceil(text.length / 4),
      finishReason: 'stop',
    };
  }

  async *stream(request: GenerationRequest, signal: AbortSignal): AsyncIterable<string> {
    const text = await this.run(request, signal, this.streamBehaviours.get(request.model.id));
    // Chunked so streaming behaviour is exercised, not just the final string.
    for (const word of text.split(/(?<=\s)/)) {
      if (signal.aborted) throw Errors.cancelled();
      yield word;
    }
  }

  private async run(
    request: GenerationRequest,
    signal: AbortSignal,
    override?: TestBehaviour,
  ): Promise<string> {
    const modelId = request.model.id;
    this.calls.push(modelId);

    // A signal can already be aborted on arrival. addEventListener('abort')
    // never fires in that case, so it has to be checked up front — otherwise
    // the call runs to completion after cancellation.
    if (signal.aborted) {
      this.aborted.push(modelId);
      throw Errors.cancelled();
    }

    const behaviour = override ?? this.behaviours.get(modelId) ?? this.defaultBehaviour;

    if (behaviour.kind === 'fail') throw behaviour.error;
    if (behaviour.kind === 'empty') return '';

    const delayMs = behaviour.kind === 'hang' ? behaviour.forMs : (behaviour.delayMs ?? 0);
    if (delayMs > 0) await this.wait(delayMs, signal, modelId);

    if (behaviour.kind === 'hang') throw Errors.timeout({ modelId });

    const prompt = request.messages.at(-1)?.content ?? '';
    return (
      behaviour.text ??
      `Test response from ${request.model.displayName} regarding: ${prompt.slice(0, 80)}`
    );
  }

  /** Rejects on abort so cancellation propagates rather than being swallowed. */
  private wait(ms: number, signal: AbortSignal, modelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        this.aborted.push(modelId);
        reject(Errors.cancelled());
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          this.aborted.push(modelId);
          reject(Errors.cancelled());
        },
        { once: true },
      );
    });
  }
}
