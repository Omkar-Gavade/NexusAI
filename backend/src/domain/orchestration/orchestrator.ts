import { ObjectId } from 'mongodb';
import { authCauseOf } from '../models/health.ts';
import {
  classifyTask,
  estimateModelCost,
  isRoutable,
  type ChatEvent,
  type Message,
  type MessageStatus,
  type ModelOutcome,
  type RoutingDecision,
  type RoutingMode,
  type Stance,
} from '@nexusai/contracts';
import type { Config } from '../../config/env.ts';
import type { Logger } from '../../infrastructure/observability/logger.ts';
import type { ConversationRepository } from '../../infrastructure/repositories/conversation-repository.ts';
import type { MessageRepository } from '../../infrastructure/repositories/message-repository.ts';
import type { ModelResponseDoc } from '../../infrastructure/repositories/types.ts';
import { emptyUsage, type StreamUsage } from '../../infrastructure/llm/adapter.ts';
import { toWireMessage } from '../../application/conversation-service.ts';
import { AppError, Errors, isAppError } from '../errors.ts';
import type { ModelDefinition } from '../models/catalog.ts';
import type { ModelRegistry } from '../models/registry.ts';
import { buildSynthesisMessages, VERDICT_CLOSE, VERDICT_OPEN } from '../synthesis/prompt.ts';
import { computeAgreement, parseVerdicts, type OutcomeSummary } from './agreement.ts';
import { stallTimeout, type StallTimeout } from './stall-timeout.ts';

export interface OrchestratorRequest {
  readonly userId: string;
  readonly conversationId: string | null;
  readonly message: string;
  readonly clientMessageId: string;
  readonly selection:
    | { mode: 'auto'; routing: RoutingMode }
    | { mode: 'manual'; modelId: string }
    | { mode: 'compare'; modelIds: string[] };
  readonly requestId: string;
}

interface ModelAttempt {
  readonly model: ModelDefinition;
  text: string;
  outcome: ModelOutcome;
  latencyMs: number;
  firstTokenMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  errorCode: string | null;
}

/**
 * A one-producer, one-consumer async channel.
 *
 * The fan-out runs inside worker callbacks, and a generator cannot yield from a
 * callback. Buffering the events and yielding them after `Promise.all` was the
 * obvious way to bridge that, but it makes every model appear to finish at the
 * moment the *slowest* one does — a fast model's result is held back for no
 * reason, and the provenance rail can never show a model landing early. Since
 * the rail reports what actually happened, "happened" has to include when.
 */
class EventChannel {
  private readonly buffer: ChatEvent[] = [];
  private waiting: (() => void) | null = null;
  private closed = false;

  push(event: ChatEvent): void {
    this.buffer.push(event);
    this.wake();
  }

  close(): void {
    this.closed = true;
    this.wake();
  }

  private wake(): void {
    const resume = this.waiting;
    this.waiting = null;
    resume?.();
  }

  async *drain(): AsyncGenerator<ChatEvent> {
    for (;;) {
      for (let next = this.buffer.shift(); next; next = this.buffer.shift()) yield next;
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.waiting = resolve;
      });
    }
  }
}

/**
 * The brain.
 *
 * Emits `ChatEvent`s and knows nothing about HTTP — the route frames them as
 * SSE. That keeps the whole flow testable by consuming the iterable directly,
 * which is where the event-ordering and cancellation tests live.
 */
export class ChatOrchestrator {
  constructor(
    private readonly deps: {
      config: Config;
      registry: ModelRegistry;
      conversations: ConversationRepository;
      messages: MessageRepository;
      logger: Logger;
    },
  ) {}

  async *run(request: OrchestratorRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    const { config, registry, messages, logger } = this.deps;
    const startedAt = Date.now();
    const turnMode = request.selection.mode;

    // Idempotency first: the same ULID twice is a double-submit or a network
    // retry, both of which would otherwise bill two generations and produce two
    // divergent answers. Checked before anything is created, or a retry leaves
    // an orphaned conversation behind on its way to the 409.
    const existing = await messages.findByClientMessageId(request.userId, request.clientMessageId);
    if (existing) throw Errors.duplicateRequest();

    const { plan, routingDecision } = this.resolvePlan(request);

    // For an existing conversation, ownership is settled before anything is
    // written. For a new one, only the id is reserved here — the row itself is
    // created after the user message lands, so a duplicate send that loses the
    // race against the unique index leaves no orphan conversation behind.
    const existingConversation = request.conversationId
      ? await this.requireOwnedConversation(request.userId, request.conversationId)
      : null;
    const conversationId = existingConversation ?? new ObjectId().toHexString();

    const history = existingConversation ? await this.buildHistory(conversationId) : [];

    // This insert is the idempotency barrier: the unique partial index on
    // (userId, clientMessageId) rejects a concurrent duplicate here.
    await messages.insert({
      conversationId: new ObjectId(conversationId),
      userId: new ObjectId(request.userId),
      role: 'user',
      content: request.message,
      status: 'complete',
      clientMessageId: request.clientMessageId,
      synthesisModel: null,
      responses: [],
      agreement: null,
      sources: [],
      metadata: null,
      createdAt: new Date(),
    });

    if (!existingConversation) {
      await this.deps.conversations.createWithId(
        conversationId,
        request.userId,
        deriveTitle(request.message),
      );
    }

    // Reserved now so `start` can name it, but inserted at `failed` so a
    // process death can never leave a message in a non-terminal state. The
    // status is corrected once the turn actually resolves.
    const assistantId = new ObjectId();
    await messages.insert({
      _id: assistantId,
      conversationId: new ObjectId(conversationId),
      userId: new ObjectId(request.userId),
      role: 'assistant',
      content: '',
      status: 'failed',
      mode: turnMode,
      selectedModelId: null,
      routingDecision,
      clientMessageId: null,
      synthesisModel: null,
      responses: [],
      agreement: null,
      sources: [],
      metadata: null,
      createdAt: new Date(),
    } as never);

    yield {
      type: 'start',
      conversationId,
      messageId: assistantId.toHexString(),
      plan: plan.map((m) => registry.ref(m)),
      mode: turnMode,
      routingDecision,
    };

    // --- Model fan-out ------------------------------------------------------
    const attempts = new Map<string, ModelAttempt>();
    const pending: Array<Promise<void>> = [];

    for (const model of plan) yield { type: 'model_start', modelId: model.id };

    // The client may have disconnected while the plan was being announced.
    // Starting paid provider calls for an answer nobody will read is the exact
    // waste cancellation exists to prevent.
    if (signal.aborted) {
      yield* this.finaliseCancelled(
        assistantId,
        conversationId,
        attempts,
        plan,
        startedAt,
        '',
        turnMode,
        routingDecision,
      );
      return;
    }

    const queue = [...plan];
    const workers = Math.min(config.MAX_CONCURRENT_MODEL_CALLS, plan.length);
    const channel = new EventChannel();

    /*
     * Where a model's text goes while it is still being written.
     *
     * One model is the whole answer, so its text reaches the reader as it
     * arrives rather than after the last token — previously a single-model turn
     * showed nothing until the provider had finished. In the Arena each panel
     * fills the same way. Only a synthesis fan-out keeps per-model text on the
     * server, because the reader is shown the reconciled answer instead.
     *
     * `turnFirstTokenMs` is when the reader first saw answer text: measured at
     * the first forwarded chunk, never inferred from a completion time.
     */
    const directStream = turnMode !== 'compare' && plan.length === 1;
    let turnFirstTokenMs: number | null = null;
    const forwardTo = (model: ModelDefinition) => (chunk: string) => {
      turnFirstTokenMs ??= Date.now() - startedAt;
      channel.push(
        turnMode === 'compare'
          ? { type: 'arena_delta', modelId: model.id, text: chunk }
          : { type: 'delta', text: chunk },
      );
    };

    const runOne = async (model: ModelDefinition): Promise<void> => {
      const attempt = await this.callModel(
        model,
        request.message,
        history,
        signal,
        turnMode === 'compare' || directStream ? forwardTo(model) : undefined,
      );
      attempts.set(model.id, attempt);

      // Per-model timing, on the model's own completion rather than the turn's.
      // Ids only: prompts and responses never reach the log.
      logger.info(
        {
          requestId: request.requestId,
          modelId: model.id,
          provider: model.provider,
          outcome: attempt.outcome,
          latencyMs: attempt.latencyMs,
          errorCode: attempt.errorCode,
        },
        'model call finished',
      );

      channel.push(
        attempt.outcome === 'complete' || attempt.outcome === 'empty'
          ? {
              type: 'model_complete',
              modelId: model.id,
              text: attempt.text,
              outcome: attempt.outcome,
              latencyMs: attempt.latencyMs,
              firstTokenMs: attempt.firstTokenMs,
              inputTokens: attempt.inputTokens,
              outputTokens: attempt.outputTokens,
              estimatedCostUsd: attempt.estimatedCostUsd,
            }
          : {
              type: 'model_error',
              modelId: model.id,
              code: (attempt.errorCode ?? 'PROVIDER_ERROR') as ChatEvent extends {
                type: 'model_error';
                code: infer C;
              }
                ? C
                : never,
              message: 'This model did not return a response.',
            },
      );
    };

    // Bounded concurrency: N workers draining a shared queue. An unbounded
    // Promise.all over a user-controlled list is a fan-out amplifier.
    for (let i = 0; i < workers; i += 1) {
      pending.push(
        (async () => {
          for (;;) {
            const model = queue.shift();
            if (!model) return;
            await runOne(model);
          }
        })(),
      );
    }

    // Closed in `finally` so an unexpected worker rejection still terminates
    // the drain rather than hanging the turn. The rejection is re-raised below.
    let fanoutError: unknown = null;
    const fanout = Promise.all(pending)
      .catch((error: unknown) => {
        fanoutError = error;
      })
      .finally(() => channel.close());

    // Each model's result reaches the client as it lands, in completion order.
    // The rail's positions come from `plan` in the `start` event, so arrival
    // order here does not move anything on screen.
    for await (const event of channel.drain()) yield event;
    await fanout;
    if (fanoutError) throw fanoutError;

    // What the reader had already been shown when a direct answer is stopped.
    const directModel = directStream ? plan[0] : undefined;
    const directText = directModel ? (attempts.get(directModel.id)?.text ?? '') : '';

    if (signal.aborted) {
      yield* this.finaliseCancelled(
        assistantId,
        conversationId,
        attempts,
        plan,
        startedAt,
        directText,
        turnMode,
        routingDecision,
        turnFirstTokenMs,
      );
      return;
    }

    // --- Synthesis / Arena Resolution ---------------------------------------
    const contributions = plan
      .map((model) => attempts.get(model.id))
      .filter((a): a is ModelAttempt => Boolean(a && a.outcome === 'complete' && a.text.trim()))
      .map((a) => ({ model: a.model, text: a.text }));

    if (contributions.length === 0) {
      // A direct answer that broke off mid-stream keeps what the reader saw.
      const partial = directText.trim() ? directText : '';
      await this.persist(assistantId, conversationId, {
        content: partial,
        status: partial ? 'failed_partial' : 'failed',
        mode: turnMode,
        routingDecision,
        attempts,
        plan,
        stances: {},
        synthesisModel: null,
        startedAt,
        firstTokenMs: turnFirstTokenMs,
      });
      /*
       * Not a synthesis failure — synthesis never ran. `SYNTHESIS_FAILED`
       * carries the message "the individual responses arrived, but couldn't be
       * reconciled", which is false here: nothing arrived. Shown to a user who
       * had explicitly picked one model, it also implied an orchestration they
       * never asked for.
       *
       * A single planned model is named, because the reader chose it. Several
       * planned models stay unnamed: listing every provider that failed is
       * operator detail, and the user's next move is the same either way.
       */
      const only = plan.length === 1 ? plan[0] : undefined;
      throw only
        ? Errors.modelUnavailable(only.displayName, { reason: 'no usable response' })
        : Errors.providerUnavailable({ reason: 'no model returned a usable response' });
    }

    // In Model Arena (`compare`) mode, responses are presented side by side so
    // the user can inspect, select a preferred answer, or explicitly request
    // synthesis via "Combine answers".
    if (turnMode === 'compare') {
      yield {
        type: 'agreement',
        agreement: computeAgreement(this.summarise(plan, attempts, {})),
        stances: this.fullStances(plan, attempts, {}),
      };
      yield { type: 'sources', sources: [] };

      const elapsed = Date.now() - startedAt;
      await this.persist(assistantId, conversationId, {
        content: '',
        status: 'complete',
        mode: turnMode,
        routingDecision,
        attempts,
        plan,
        stances: {},
        synthesisModel: null,
        startedAt,
        firstTokenMs: turnFirstTokenMs,
      });

      logger.info(
        {
          requestId: request.requestId,
          conversationId,
          messageId: assistantId.toHexString(),
          mode: turnMode,
          planned: plan.length,
          responded: contributions.length,
          durationMs: elapsed,
        },
        'arena comparison turn completed',
      );

      yield {
        type: 'complete',
        messageId: assistantId.toHexString(),
        latencyMs: elapsed,
        firstTokenMs: turnFirstTokenMs,
      };
      return;
    }

    // The synthesis stage is a single point of failure for a turn whose models
    // already answered: observed live, a rate-limited synthesist threw away
    // three good responses and left the user with nothing. Failing over is only
    // safe before any text has been streamed — once the reader has seen part of
    // an answer, restarting it with a different model would rewrite what they
    // are already reading.

    /*
     * A model that failed during this turn's fan-out may not write the answer.
     * Selecting one blindly produced the observed failure: Gemini returned
     * RATE_LIMITED in the fan-out and was then chosen, seconds later, to
     * synthesise — and failed again for exactly the same reason.
     */
    const failedThisTurn = [...attempts.values()]
      .filter((attempt) => attempt.outcome !== 'complete')
      .map((attempt) => attempt.model.id);

    /*
     * Synthesis reconciles disagreement. With one response there is nothing to
     * reconcile, so the answer is that response, returned directly.
     *
     * This is not an optimisation. Requiring a second model to restate a single
     * good answer is what made an explicit single-model selection fail: the
     * user chose Groq, Groq answered in 732ms, and the turn was lost because an
     * unrelated model was asked to rewrite it and was rate limited.
     *
     * A direct answer is persisted with `synthesisModel: null` — the existing
     * provenance signal for "not synthesised". No verdict is parsed, no stance
     * assigned, no agreement claimed.
     */
    const ineligible = [...failedThisTurn];
    let synthesist = contributions.length >= 2 ? registry.synthesisModel(ineligible) : undefined;

    /*
     * Responses in hand but nothing able to reconcile them is a degraded turn,
     * not a failed one. `contributions` is in plan order, so the first entry is
     * the highest-ranked model that answered.
     */
    if (!synthesist) {
      yield* this.answerDirectly(
        assistantId,
        conversationId,
        contributions,
        attempts,
        plan,
        startedAt,
        request.requestId,
        contributions.length === 1 ? 'single response' : 'no synthesist available',
        turnMode,
        routingDecision,
        directStream ? turnFirstTokenMs : undefined,
      );
      return;
    }

    let raw = '';
    let emitted = '';
    let verdictsSent = false;
    let stances: Record<string, Stance> = {};
    let firstTokenMs: number | null = null;
    let synthesisUsage = emptyUsage();
    let synthesisTimeout: StallTimeout | undefined;

    for (;;) {
    yield { type: 'synthesis_start', model: registry.ref(synthesist) };
    ineligible.push(synthesist.id);
    synthesisUsage = emptyUsage();

    const adapter = registry.adapterFor(synthesist);
    if (!adapter) throw Errors.noModelAvailable();

    // Silence-limited like the model calls: a long reconciled answer that is
    // still arriving is not a stalled synthesist.
    synthesisTimeout?.dispose();
    synthesisTimeout = stallTimeout(config.SYNTHESIS_TIMEOUT_MS, config.ORCHESTRATION_TIMEOUT_MS);
    const synthesisSignal = AbortSignal.any([signal, synthesisTimeout.signal]);

    try {
      // Built as a pair: the fence label in the instructions must be the same
      // one wrapping the untrusted content, or the boundary is decorative.
      const prompt = buildSynthesisMessages(request.message, contributions);

      const stream = adapter.stream(
        {
          model: synthesist,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          maxOutputTokens: synthesist.maxOutputTokens,
          temperature: 0.3,
        },
        synthesisSignal,
        synthesisUsage,
      );

      for await (const chunk of stream) {
        synthesisTimeout.touch();
        raw += chunk;
        firstTokenMs ??= Date.now() - startedAt;

        // The verdict block is withheld from the user: it is machine notation,
        // not part of the answer. Nothing streams until it has been consumed.
        if (!verdictsSent) {
          const closed = raw.includes(VERDICT_CLOSE);
          if (!closed && !verdictBlockRuledOut(raw)) continue;

          // Ruled out means the synthesiser ignored the format. The text is
          // the answer, and every stance stays `unknown`.
          const parsed = closed
            ? parseVerdicts(raw)
            : { stances: {}, remainder: raw, parsed: false };
          stances = parsed.stances;
          verdictsSent = true;

          yield {
            type: 'agreement',
            agreement: computeAgreement(this.summarise(plan, attempts, stances)),
            stances: this.fullStances(plan, attempts, stances),
          };

          if (parsed.remainder) {
            emitted = parsed.remainder;
            yield { type: 'delta', text: parsed.remainder };
          }
          continue;
        }

        emitted += chunk;
        yield { type: 'delta', text: chunk };
      }
    } catch (error) {
      synthesisTimeout.dispose();
      const failure: AppError = isAppError(error)
        ? error
        : synthesisTimeout.fired && !signal.aborted
          ? Errors.timeout({ modelId: synthesist.id })
          : Errors.synthesisFailed({ cause: String(error) });
      registry.health.recordFailure(synthesist.provider, {
        affectsHealth: failure.retryable,
        isAuthError: failure.code === 'AUTH_ERROR',
        authCause: authCauseOf(failure.context),
      });

      // Nothing streamed yet, the client is still connected, and another
      // synthesis-capable model is configured: the models' work is not lost to
      // one provider having a bad minute.
      const alternative =
        !emitted && !signal.aborted && failure.code !== 'CANCELLED'
          ? registry.synthesisModel(ineligible)
          : undefined;

      if (alternative) {
        logger.warn(
          {
            requestId: request.requestId,
            failed: synthesist.id,
            code: failure.code,
            fallback: alternative.id,
          },
          'synthesis failed over to another model',
        );
        synthesist = alternative;
        raw = '';
        continue;
      }

      /*
       * Every synthesis-capable model has now failed, but models answered.
       * Their work is delivered rather than discarded — this is the case that
       * put an error on screen while a valid 925-character response sat unused.
       *
       * Only when nothing has streamed. Once the reader has seen text the
       * no-restart rule takes precedence and the partial answer is kept as-is.
       */
      if (!emitted && !signal.aborted && failure.code !== 'CANCELLED') {
        logger.warn(
          { requestId: request.requestId, failed: synthesist.id, code: failure.code },
          'synthesis exhausted; answering directly from a successful model',
        );
        yield* this.answerDirectly(
          assistantId,
          conversationId,
          contributions,
          attempts,
          plan,
          startedAt,
          request.requestId,
          'synthesis exhausted',
          turnMode,
          routingDecision,
        );
        return;
      }

      // Whatever was already written is kept: the reader saw it, and discarding
      // it is destructive.
      await this.persist(assistantId, conversationId, {
        content: emitted,
        status: emitted ? 'failed_partial' : 'failed',
        mode: turnMode,
        routingDecision,
        attempts,
        plan,
        stances,
        synthesisModel: synthesist,
        synthesisUsage,
        startedAt,
        firstTokenMs,
      });
      throw failure;
    }

    break;
    }
    synthesisTimeout?.dispose();

    if (signal.aborted) {
      yield* this.finaliseCancelled(
        assistantId,
        conversationId,
        attempts,
        plan,
        startedAt,
        emitted,
        turnMode,
        routingDecision,
        firstTokenMs,
      );
      return;
    }

    // The synthesiser never closed the block, so no stance was ever judged.
    // Every model stays `unknown` rather than being assigned one.
    if (!verdictsSent) {
      const parsed = parseVerdicts(raw);
      emitted = parsed.remainder || raw;
      yield {
        type: 'agreement',
        agreement: computeAgreement(this.summarise(plan, attempts, {})),
        stances: this.fullStances(plan, attempts, {}),
      };
      if (emitted) yield { type: 'delta', text: emitted };
    }

    registry.health.recordSuccess(synthesist.provider);

    // No adapter extracts sources, and none is fabricated. The event is emitted
    // with an empty list so the client's state is explicit rather than absent.
    yield { type: 'sources', sources: [] };

    if (!emitted.trim()) {
      await this.persist(assistantId, conversationId, {
        content: '',
        status: 'failed',
        mode: turnMode,
        routingDecision,
        attempts,
        plan,
        stances,
        synthesisModel: synthesist,
        synthesisUsage,
        startedAt,
        firstTokenMs,
      });
      throw Errors.synthesisFailed({ reason: 'synthesis produced no text' });
    }

    await this.persist(assistantId, conversationId, {
      content: emitted,
      status: 'complete',
      mode: turnMode,
      routingDecision,
      attempts,
      plan,
      stances,
      synthesisModel: synthesist,
      synthesisUsage,
      startedAt,
      firstTokenMs,
    });

    logger.info(
      {
        requestId: request.requestId,
        conversationId,
        messageId: assistantId.toHexString(),
        mode: request.selection.mode,
        planned: plan.length,
        responded: contributions.length,
        durationMs: Date.now() - startedAt,
      },
      'chat turn completed',
    );

    yield {
      type: 'complete',
      messageId: assistantId.toHexString(),
      latencyMs: Date.now() - startedAt,
      firstTokenMs,
    };
  }

  /**
   * Combine completed model responses on an existing Arena/multi-model message
   * using the standard synthesis pipeline and persist the result.
   */
  async synthesizeMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    signal: AbortSignal,
    filterModelIds?: readonly string[],
  ): Promise<Message> {
    const { config, registry, messages, logger } = this.deps;
    const doc = await messages.findByIdOwned(userId, conversationId, messageId);
    if (!doc || doc.role !== 'assistant') throw Errors.notFound();

    const allowedIds = filterModelIds ? new Set(filterModelIds) : null;
    const contributions: Array<{ model: ModelDefinition; text: string }> = [];

    for (const r of doc.responses) {
      if (r.outcome !== 'complete' || !r.text.trim()) continue;
      if (allowedIds && !allowedIds.has(r.model.modelId)) continue;
      const def = registry.find(r.model.modelId);
      if (def) contributions.push({ model: def, text: r.text });
    }

    if (contributions.length < 2) {
      throw Errors.validation([
        {
          path: 'modelIds',
          message: 'At least two completed model responses are required to combine answers',
        },
      ]);
    }

    const userMsg = await messages.findPrecedingUserMessage(conversationId, doc._id, doc.createdAt);
    const question = userMsg?.content ?? 'Synthesise the responses below.';

    const failedIds = doc.responses
      .filter((r) => r.outcome !== 'complete')
      .map((r) => r.model.modelId);
    const ineligible = [...failedIds];

    let synthesist = registry.synthesisModel(ineligible);
    if (!synthesist) throw Errors.noModelAvailable();

    let raw = '';
    for (;;) {
      ineligible.push(synthesist.id);
      const adapter = registry.adapterFor(synthesist);
      if (!adapter) throw Errors.noModelAvailable();

      const synthesisSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(config.SYNTHESIS_TIMEOUT_MS),
      ]);

      try {
        const prompt = buildSynthesisMessages(question, contributions);
        const result = await adapter.generate(
          {
            model: synthesist,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            maxOutputTokens: synthesist.maxOutputTokens,
            temperature: 0.3,
          },
          synthesisSignal,
        );
        raw = result.text;
        registry.health.recordSuccess(synthesist.provider);
        break;
      } catch (error) {
        const failure = isAppError(error) ? error : Errors.synthesisFailed({ cause: String(error) });
        registry.health.recordFailure(synthesist.provider, {
          affectsHealth: failure.retryable,
          isAuthError: failure.code === 'AUTH_ERROR',
          authCause: authCauseOf(failure.context),
        });
        const alternative =
          !signal.aborted && failure.code !== 'CANCELLED'
            ? registry.synthesisModel(ineligible)
            : undefined;
        if (alternative) {
          logger.warn(
            { messageId, failed: synthesist.id, fallback: alternative.id },
            'arena synthesis failed over to another model',
          );
          synthesist = alternative;
          continue;
        }
        throw failure;
      }
    }

    const parsed = parseVerdicts(raw);
    const content = (parsed.remainder || raw).trim();
    if (!content) throw Errors.synthesisFailed({ reason: 'synthesis produced no text' });

    // Only the models that contributed were judged; every other stance is
    // reset to unknown rather than carried over from an earlier synthesis.
    const judged = new Set(contributions.map((c) => c.model.id));
    const synthesisRef = registry.ref(synthesist);
    const fresh = await messages.applySynthesis(doc._id, {
      content,
      synthesisModel: synthesisRef,
      stances: doc.responses.map((r) => ({
        modelId: r.model.modelId,
        stance: judged.has(r.model.modelId)
          ? (parsed.stances[r.model.modelId] ?? 'unknown')
          : 'unknown',
      })),
    });
    if (!fresh) throw Errors.notFound();
    return toWireMessage(fresh);
  }

  /**
   * Re-runs a single model on an existing assistant turn without erasing or
   * interrupting the other models' responses.
   */
  async retryModel(
    userId: string,
    conversationId: string,
    messageId: string,
    modelId: string,
    signal: AbortSignal,
  ): Promise<Message> {
    const { registry, messages } = this.deps;
    const doc = await messages.findByIdOwned(userId, conversationId, messageId);
    if (!doc || doc.role !== 'assistant') throw Errors.notFound();

    const model = registry.find(modelId);
    if (!model) throw Errors.modelNotFound({ modelId });
    if (!doc.responses.some((r) => r.model.modelId === modelId)) {
      throw Errors.modelNotFound({ modelId });
    }

    const userMsg = await messages.findPrecedingUserMessage(conversationId, doc._id, doc.createdAt);
    const question = userMsg?.content ?? '';
    if (!userMsg || !question) throw Errors.notFound();

    // The conversation as it stood when this turn was asked. Retrying with no
    // history answered a follow-up as if it were the first message — "what
    // about the second one?" with nothing for "the second one" to refer to.
    const history = await this.buildHistory(conversationId, userMsg._id);
    const attempt = await this.callModel(model, question, history, signal);
    const newResponseDoc: ModelResponseDoc = {
      model: registry.ref(model),
      text: attempt.text,
      outcome: attempt.outcome,
      stance: 'unknown',
      latencyMs: attempt.latencyMs,
      firstTokenMs: attempt.firstTokenMs,
      inputTokens: attempt.inputTokens,
      outputTokens: attempt.outputTokens,
      estimatedCostUsd: attempt.estimatedCostUsd,
      errorCode: attempt.errorCode,
    };

    // The response, the turn's accumulated spend, its status and its
    // agreement are each written by an atomic update against what is stored
    // now, never from this snapshot — so a retry that overlaps another retry,
    // or a synthesis, keeps every result.
    // A retry is spend on top of the original call, which was billed whether
    // or not it answered, so usage accumulates rather than being replaced.
    const fresh = await messages.recordRetry(doc._id, modelId, newResponseDoc, {
      inputTokens: attempt.inputTokens,
      outputTokens: attempt.outputTokens,
      estimatedCostUsd: attempt.estimatedCostUsd,
    });
    if (!fresh) throw Errors.notFound();
    return toWireMessage(fresh);
  }

  // --- helpers -------------------------------------------------------------

  /**
   * Deliver a model's own response as the answer, without synthesis.
   *
   * Used when there is nothing to reconcile (one response) or nothing able to
   * reconcile it (every synthesis-capable model unavailable). Both are degraded
   * turns, and both are better than the error the reader used to get while a
   * good answer sat unused in memory.
   *
   * `synthesisModel: null` is the provenance signal for "not synthesised" — the
   * field already exists and is already nullable, so no contract changes. No
   * verdict block is parsed and every stance stays `unknown`: claiming
   * agreement over a single response, or over responses that no model actually
   * compared, would be inventing a measurement.
   */
  private async *answerDirectly(
    assistantId: ObjectId,
    conversationId: string,
    contributions: ReadonlyArray<{ model: ModelDefinition; text: string }>,
    attempts: Map<string, ModelAttempt>,
    plan: ModelDefinition[],
    startedAt: number,
    requestId: string,
    reason: string,
    mode: 'auto' | 'manual' | 'compare' = 'auto',
    routingDecision: RoutingDecision | null = null,
    /**
     * Set when the answer already streamed to the reader as the model wrote
     * it: the text is not sent again, and this is when it first appeared.
     */
    streamedFirstTokenMs?: number | null,
  ): AsyncGenerator<ChatEvent> {
    const { logger } = this.deps;
    const streamed = streamedFirstTokenMs !== undefined;
    // `contributions` is in plan order, so this is the highest-ranked model
    // that answered. No new ranking is introduced.
    const [best] = contributions;
    // Both call sites check first; asserted rather than assumed so a future
    // caller cannot reach here with nothing to deliver.
    if (!best) throw Errors.synthesisFailed({ reason: 'no response available to deliver' });

    logger.info(
      { requestId, responded: contributions.length, model: best.model.id, reason },
      'answering directly without synthesis',
    );

    if (reason === 'synthesis exhausted') {
      yield { type: 'synthesis_fallback' };
    }

    yield {
      type: 'agreement',
      agreement: computeAgreement(this.summarise(plan, attempts, {})),
      stances: this.fullStances(plan, attempts, {}),
    };
    // Delivered in one piece here, so this is the moment it first appears.
    const firstTokenMs = streamed ? streamedFirstTokenMs : Date.now() - startedAt;
    if (!streamed) yield { type: 'delta', text: best.text };
    yield { type: 'sources', sources: [] };

    const elapsed = Date.now() - startedAt;
    await this.persist(assistantId, conversationId, {
      content: best.text,
      status: 'complete',
      mode,
      routingDecision,
      attempts,
      plan,
      stances: {},
      synthesisModel: null,
      startedAt,
      firstTokenMs,
    });

    yield {
      type: 'complete',
      messageId: assistantId.toHexString(),
      latencyMs: elapsed,
      firstTokenMs,
    };
  }

  private resolvePlan(request: OrchestratorRequest): {
    plan: ModelDefinition[];
    routingDecision: RoutingDecision;
  } {
    const { config, registry } = this.deps;

    if (request.selection.mode === 'manual') {
      const model = registry.find(request.selection.modelId);
      if (!model) throw Errors.modelNotFound({ modelId: request.selection.modelId });
      if (!registry.isConfigured(model)) throw Errors.modelNotConfigured(model.displayName);

      const availability = registry.availabilityOf(model);
      if (availability !== 'AVAILABLE' && availability !== 'UNKNOWN') {
        throw Errors.modelUnavailable(model.displayName, { availability });
      }
      const { category, label } = classifyTask(request.message);
      // A manual choice is authoritative. No substitution, ever — a silent
      // swap would make the provenance rail report a model that never ran.
      return {
        plan: [model],
        routingDecision: {
          taskCategory: category,
          taskLabel: label,
          selectedModelIds: [model.id],
          reason: `Manually selected ${model.displayName} — suitable for this ${label}.`,
          overridden: true,
        },
      };
    }

    if (request.selection.mode === 'compare') {
      // The contract already guarantees 2–4 distinct ids. A deployment cap
      // below that is reported, never applied by quietly dropping models.
      const uniqueIds = [...new Set(request.selection.modelIds)];
      if (uniqueIds.length < 2) {
        throw Errors.validation([
          {
            path: 'selection.modelIds',
            message: 'Select at least two distinct models to compare',
          },
        ]);
      }
      if (uniqueIds.length > config.MAX_MODELS_PER_REQUEST) {
        throw Errors.validation([
          {
            path: 'selection.modelIds',
            message: `This server compares at most ${config.MAX_MODELS_PER_REQUEST} models at once`,
          },
        ]);
      }

      const plan: ModelDefinition[] = [];
      for (const id of uniqueIds) {
        const model = registry.find(id);
        if (!model) throw Errors.modelNotFound({ modelId: id });
        plan.push(model);
      }

      // At least one requested model must be routable to run an Arena turn;
      // individual unavailable models fail gracefully in-panel during fan-out.
      const anyRoutable = plan.some(
        (m) => registry.isConfigured(m) && isRoutable(registry.availabilityOf(m)),
      );
      if (!anyRoutable) throw Errors.noModelAvailable();

      const { category, label } = classifyTask(request.message);
      const names = plan.map((m) => m.displayName).join(', ');
      return {
        plan,
        routingDecision: {
          taskCategory: category,
          taskLabel: label,
          selectedModelIds: plan.map((m) => m.id),
          reason: `Comparing ${names} side by side for this ${label}.`,
          overridden: true,
        },
      };
    }

    const { models: plan, decision } = registry.routeTask(
      request.message,
      request.selection.routing,
    );
    if (plan.length === 0) throw Errors.noModelAvailable();
    return { plan, routingDecision: decision };
  }

  /** Ownership is settled before any write. Returns the id, or throws 404. */
  private async requireOwnedConversation(userId: string, conversationId: string): Promise<string> {
    const owned = await this.deps.conversations.findOwned(userId, conversationId);
    if (!owned) throw Errors.notFound();
    return conversationId;
  }

  private async buildHistory(
    conversationId: string,
    beforeId?: ObjectId,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const { config, messages } = this.deps;
    const rows = await messages.recentForContext(
      conversationId,
      config.MAX_HISTORY_MESSAGES,
      beforeId,
    );

    // Bounded by characters as well as count: twenty long turns can still blow
    // past a context window.
    const selected: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let budget = config.MAX_HISTORY_CHARS;

    for (const row of rows.toReversed()) {
      let effectiveContent = row.content;
      if (row.role === 'assistant') {
        // When a user selects a specific answer in Model Arena, follow-up turns
        // use that selected answer exclusively so unrelated model outputs are
        // never mixed into the conversation context.
        if (row.selectedModelId) {
          const chosen = row.responses.find(
            (r) =>
              r.model.modelId === row.selectedModelId &&
              r.outcome === 'complete' &&
              Boolean(r.text.trim()),
          );
          if (chosen) effectiveContent = chosen.text;
        }
        if (!effectiveContent.trim()) {
          const firstComplete = row.responses.find(
            (r) => r.outcome === 'complete' && Boolean(r.text.trim()),
          );
          if (firstComplete) effectiveContent = firstComplete.text;
        }
      }

      if (!effectiveContent || effectiveContent.length > budget) break;
      budget -= effectiveContent.length;
      selected.unshift({ role: row.role, content: effectiveContent });
    }
    return selected;
  }

  private async callModel(
    model: ModelDefinition,
    question: string,
    history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>,
    signal: AbortSignal,
    /** Receives each chunk as it arrives, for callers that show it live. */
    onChunk?: (chunk: string) => void,
  ): Promise<ModelAttempt> {
    const { config, registry } = this.deps;
    const startedAt = Date.now();
    const adapter = registry.adapterFor(model);

    const base: ModelAttempt = {
      model,
      text: '',
      outcome: 'failed',
      latencyMs: 0,
      firstTokenMs: null,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      errorCode: null,
    };

    if (!adapter || !registry.isConfigured(model)) {
      return { ...base, errorCode: 'MODEL_NOT_CONFIGURED' };
    }

    const availability = registry.availabilityOf(model);
    if (!isRoutable(availability)) {
      return { ...base, errorCode: 'MODEL_UNAVAILABLE' };
    }

    // A silence limit (restarted by every chunk) and a hard ceiling, plus the
    // caller's cancellation. Any of them aborts the underlying provider
    // request; none leaves it running.
    const timeout = stallTimeout(config.MODEL_TIMEOUT_MS, config.ORCHESTRATION_TIMEOUT_MS);
    const combined = AbortSignal.any([signal, timeout.signal]);

    // Streamed even when nobody watches the text, because that is the only way
    // to measure time to first token. Usage comes from the provider's own
    // stream frames; it stays null when a provider does not report it.
    const usage = emptyUsage();
    let text = '';
    let firstTokenMs: number | null = null;

    try {
      for await (const chunk of adapter.stream(
        {
          model,
          messages: [...history, { role: 'user', content: question }],
          maxOutputTokens: model.maxOutputTokens,
        },
        combined,
        usage,
      )) {
        if (!chunk) continue;
        timeout.touch();
        firstTokenMs ??= Date.now() - startedAt;
        text += chunk;
        onChunk?.(chunk);
      }
      // A stream that "ended" because the call was aborted (cancelled, silent
      // too long, past the ceiling) is not a finished answer, whatever text
      // arrived before it. Never record it as complete.
      if (combined.aborted) throw combined.reason;

      registry.health.recordSuccess(model.provider);
      const { estimatedCostUsd } = estimateModelCost(
        model.id,
        usage.inputTokens,
        usage.outputTokens,
      );

      return {
        ...base,
        text,
        outcome: text.trim() ? 'complete' : 'empty',
        latencyMs: Date.now() - startedAt,
        firstTokenMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd,
      };
    } catch (error) {
      const raw = isAppError(error) ? error : Errors.providerError({ cause: String(error) });

      // The adapter is handed one combined signal, so it reports every abort as
      // a cancellation — it cannot tell the caller leaving apart from the call
      // running long. Only the two source signals can, and they are here.
      //
      // Observed live: a provider hung for the full timeout and the turn was
      // recorded as `cancelled`. Provenance said the user walked away when the
      // provider had in fact stopped responding, and because a cancellation is
      // not held against a provider, the circuit breaker never saw it either.
      const cancelled = signal.aborted;
      const timedOut = !cancelled && (timeout.fired || raw.code === 'CANCELLED');
      const failure = timedOut ? Errors.timeout({ modelId: model.id }) : raw;

      registry.health.recordFailure(model.provider, {
        affectsHealth: failure.retryable && !cancelled,
        isAuthError: failure.code === 'AUTH_ERROR',
        authCause: authCauseOf(failure.context),
      });

      // Text that already streamed is kept: the reader may have seen it, and
      // it is labelled by the outcome rather than discarded.
      return {
        ...base,
        text,
        outcome: cancelled ? 'cancelled' : 'failed',
        latencyMs: Date.now() - startedAt,
        firstTokenMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd: estimateModelCost(model.id, usage.inputTokens, usage.outputTokens)
          .estimatedCostUsd,
        errorCode: failure.code,
      };
    } finally {
      timeout.dispose();
    }
  }

  private summarise(
    plan: readonly ModelDefinition[],
    attempts: ReadonlyMap<string, ModelAttempt>,
    stances: Record<string, Stance>,
  ): OutcomeSummary[] {
    return plan.map((model) => {
      const attempt = attempts.get(model.id);
      const responded = attempt?.outcome === 'complete' && Boolean(attempt.text.trim());
      return {
        modelId: model.id,
        responded,
        stance: responded ? (stances[model.id] ?? 'unknown') : 'unknown',
      };
    });
  }

  /** A model that failed is never given a stance. */
  private fullStances(
    plan: readonly ModelDefinition[],
    attempts: ReadonlyMap<string, ModelAttempt>,
    stances: Record<string, Stance>,
  ): Record<string, Stance> {
    return Object.fromEntries(
      this.summarise(plan, attempts, stances).map((o) => [o.modelId, o.stance]),
    );
  }

  private async *finaliseCancelled(
    assistantId: ObjectId,
    conversationId: string,
    attempts: ReadonlyMap<string, ModelAttempt>,
    plan: readonly ModelDefinition[],
    startedAt: number,
    partial = '',
    mode: 'auto' | 'manual' | 'compare' = 'auto',
    routingDecision: RoutingDecision | null = null,
    firstTokenMs: number | null = null,
  ): AsyncGenerator<ChatEvent> {
    await this.persist(assistantId, conversationId, {
      content: partial,
      status: 'cancelled',
      mode,
      routingDecision,
      attempts,
      plan,
      stances: {},
      synthesisModel: null,
      startedAt,
      firstTokenMs,
    });

    // Best effort: the socket is usually already gone. The client marks the
    // turn cancelled locally on abort and does not depend on receiving this.
    yield {
      type: 'cancelled',
      messageId: assistantId.toHexString(),
      latencyMs: Date.now() - startedAt,
    };
  }

  private async persist(
    assistantId: ObjectId,
    conversationId: string,
    input: {
      content: string;
      status: MessageStatus;
      mode?: 'auto' | 'manual' | 'compare';
      routingDecision?: RoutingDecision | null;
      attempts: ReadonlyMap<string, ModelAttempt>;
      plan: readonly ModelDefinition[];
      stances: Record<string, Stance>;
      synthesisModel: ModelDefinition | null;
      /** Provider-reported usage of the synthesis pass, when it ran. */
      synthesisUsage?: StreamUsage;
      startedAt: number;
      firstTokenMs: number | null;
    },
  ): Promise<void> {
    const { registry, messages, conversations } = this.deps;

    // Provenance is a record of what happened, in plan order, including the
    // models that failed. Nothing here is inferred.
    const responses: ModelResponseDoc[] = input.plan.map((model) => {
      const attempt = input.attempts.get(model.id);
      const responded = attempt?.outcome === 'complete' && Boolean(attempt.text.trim());
      return {
        model: registry.ref(model),
        text: attempt?.text ?? '',
        outcome: attempt?.outcome ?? 'failed',
        stance: responded ? (input.stances[model.id] ?? 'unknown') : 'unknown',
        latencyMs: attempt?.latencyMs ?? 0,
        firstTokenMs: attempt?.firstTokenMs ?? null,
        inputTokens: attempt?.inputTokens ?? null,
        outputTokens: attempt?.outputTokens ?? null,
        estimatedCostUsd: attempt?.estimatedCostUsd ?? null,
        errorCode: attempt?.errorCode ?? null,
      };
    });

    // The synthesis pass is billed like any other call, so the turn's usage and
    // cost include it whenever the provider reported it. Still only measured
    // numbers: an unreported synthesis adds nothing rather than a guess.
    const synthesis =
      input.synthesisModel && input.synthesisUsage
        ? { modelId: input.synthesisModel.id, ...input.synthesisUsage }
        : null;
    const synthesisCost = synthesis
      ? estimateModelCost(synthesis.modelId, synthesis.inputTokens, synthesis.outputTokens)
          .estimatedCostUsd
      : null;

    const knownCosts = [...responses.map((r) => r.estimatedCostUsd ?? null), synthesisCost].filter(
      (c): c is number => c !== null,
    );
    const estimatedCostUsd =
      knownCosts.length > 0
        ? Number(knownCosts.reduce((a, b) => a + b, 0).toFixed(8))
        : null;

    await messages.finalise(assistantId, {
      content: input.content,
      status: input.status,
      ...(input.mode ? { mode: input.mode } : {}),
      routingDecision: input.routingDecision ?? null,
      synthesisModel: input.synthesisModel ? registry.ref(input.synthesisModel) : null,
      responses,
      agreement: computeAgreement(this.summarise(input.plan, input.attempts, input.stances)),
      sources: [],
      metadata: {
        latencyMs: Date.now() - input.startedAt,
        firstTokenMs: input.firstTokenMs,
        // Fan-out plus synthesis, as reported by the providers. Never filled
        // in by estimation: a guessed number presented as measured usage is
        // the failure this product exists to avoid. `null` throughout when no
        // provider reported anything.
        inputTokens: sum([...responses.map((r) => r.inputTokens), synthesis?.inputTokens ?? null]),
        outputTokens: sum([
          ...responses.map((r) => r.outputTokens),
          synthesis?.outputTokens ?? null,
        ]),
        estimatedCostUsd,
      },
    });

    await conversations.touch(conversationId, 2);
  }
}

/**
 * Whether the synthesiser can still be in the middle of emitting a verdict
 * block.
 *
 * The block is instructed to come first, so anything that does not begin with
 * its opening tag is prose. Deciding that early matters: while this returns
 * false the answer is buffered rather than streamed, and a model that ignores
 * the format instruction — which happens — would otherwise hold the entire
 * generation back and deliver it in a single delta at the end.
 */
function verdictBlockRuledOut(raw: string): boolean {
  const head = raw.trimStart();
  if (head.length < VERDICT_OPEN.length) return false;
  if (!head.startsWith(VERDICT_OPEN)) return true;

  // Opened but still unclosed well past any plausible block. One line per
  // model, and the plan is capped, so this can only be a malformed response.
  return head.length > VERDICT_BLOCK_LIMIT;
}

/** Generous ceiling for `<verdicts>…</verdicts>`: a handful of short lines. */
const VERDICT_BLOCK_LIMIT = 600;

function sum(values: ReadonlyArray<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/**
 * The conversation title, derived server-side from the first message. No second
 * model call: that would be a hidden cost and a hidden latency for a cosmetic
 * benefit, and the user can rename.
 */
export function deriveTitle(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  if (flat.length <= 60) return flat || 'New conversation';

  const cut = flat.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

export { AppError };
