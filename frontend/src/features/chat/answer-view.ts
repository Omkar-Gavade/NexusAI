import {
  errorMessages,
  estimateModelCost,
  type Agreement,
  type ErrorCode,
  type Message,
  type ModelRef,
  type RoutingDecision,
  type Source,
} from '@nexusai/contracts';
import type { ModelSlot, StreamState } from './stream-reducer';

/**
 * The single shape AnswerBlock renders.
 *
 * A live generation and a message loaded from history are the same thing to the
 * reader, so they are the same thing to the component. Normalising here means
 * the answer surface exists once rather than being reimplemented for history —
 * which is how the two drift apart and start disagreeing about what a cancelled
 * response looks like.
 */
export interface AnswerView {
  messageId?: string | null;
  mode?: 'auto' | 'manual' | 'compare';
  selectedModelId?: string | null;
  routingDecision?: RoutingDecision | null;
  text: string;
  slots: ModelSlot[];
  agreement: Agreement | null;
  sources: Source[];
  synthesisModel: ModelRef | null;
  latencyMs: number | null;
  firstTokenMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  streaming: boolean;
  cancelled: boolean;
  error: { code: ErrorCode; message: string; partial: boolean } | null;
}

function sumNullable(values: ReadonlyArray<number | null | undefined>): number | null {
  const known = values.filter((v): v is number => v !== null && v !== undefined);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

export function fromStream(state: StreamState, slots: ModelSlot[]): AnswerView {
  const inputTokens = sumNullable(slots.map((s) => s.inputTokens));
  const outputTokens = sumNullable(slots.map((s) => s.outputTokens));
  const totalCost = sumNullable(slots.map((s) => s.estimatedCostUsd));
  return {
    messageId: state.messageId,
    mode: state.mode ?? 'auto',
    selectedModelId: null,
    routingDecision: state.routingDecision ?? null,
    text: state.text,
    slots,
    agreement: state.agreement,
    sources: state.sources,
    synthesisModel: state.synthesisModel,
    latencyMs: state.latencyMs,
    firstTokenMs: state.firstTokenMs,
    inputTokens,
    outputTokens,
    estimatedCostUsd: totalCost !== null ? Number(totalCost.toFixed(8)) : null,
    streaming: state.phase === 'models' || state.phase === 'synthesis' || state.phase === 'starting',
    cancelled: state.phase === 'cancelled',
    error: state.error,
  };
}

export function fromMessage(message: Message): AnswerView {
  const slots = message.responses.map(toSlot);
  const inputTokens = message.metadata?.inputTokens ?? sumNullable(slots.map((s) => s.inputTokens));
  const outputTokens =
    message.metadata?.outputTokens ?? sumNullable(slots.map((s) => s.outputTokens));
  const rawCost =
    message.metadata?.estimatedCostUsd !== undefined
      ? message.metadata.estimatedCostUsd
      : sumNullable(slots.map((s) => s.estimatedCostUsd));
  const estimatedCostUsd = rawCost !== null ? Number(rawCost.toFixed(8)) : null;

  return {
    messageId: message.id,
    mode: message.mode ?? 'auto',
    selectedModelId: message.selectedModelId ?? null,
    routingDecision: message.routingDecision ?? null,
    text: message.content,
    slots,
    agreement: message.agreement,
    sources: message.sources,
    synthesisModel: message.synthesisModel,
    latencyMs: message.metadata?.latencyMs ?? null,
    firstTokenMs: message.metadata?.firstTokenMs ?? null,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    // History is never in flight: a row persisted mid-generation is read back
    // as failed, so `streaming` cannot be true here.
    streaming: false,
    cancelled: message.status === 'cancelled',
    error:
      message.status === 'failed' || message.status === 'failed_partial'
        ? {
            code:
              message.responses.length === 1 && message.responses[0]?.errorCode
                ? message.responses[0].errorCode
                : message.responses.some((r) => r.outcome === 'complete')
                  ? 'SYNTHESIS_FAILED'
                  : 'PROVIDER_UNAVAILABLE',
            message:
              message.responses.length === 1 && message.responses[0]?.errorCode
                ? errorMessages[message.responses[0].errorCode]
                : message.responses.some((r) => r.outcome === 'complete')
                  ? errorMessages.SYNTHESIS_FAILED
                  : errorMessages.PROVIDER_UNAVAILABLE,
            partial: message.status === 'failed_partial' || message.content.length > 0,
          }
        : null,
  };
}

function toSlot(response: Message['responses'][number]): ModelSlot {
  const estimatedCostUsd =
    response.estimatedCostUsd !== undefined
      ? response.estimatedCostUsd
      : estimateModelCost(response.model.modelId, response.inputTokens, response.outputTokens)
          .estimatedCostUsd;
  return {
    model: response.model,
    phase: response.outcome === 'failed' ? 'failed' : 'complete',
    text: response.text,
    outcome: response.outcome,
    stance: response.stance,
    latencyMs: response.latencyMs,
    firstTokenMs: response.firstTokenMs ?? null,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    estimatedCostUsd,
    errorCode: response.errorCode,
    errorMessage: null,
  };
}
