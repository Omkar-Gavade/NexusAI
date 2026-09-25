import { errorMessages, type Agreement, type ErrorCode, type Message, type ModelRef, type Source } from '@nexusai/contracts';
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
  text: string;
  slots: ModelSlot[];
  agreement: Agreement | null;
  sources: Source[];
  synthesisModel: ModelRef | null;
  latencyMs: number | null;
  streaming: boolean;
  cancelled: boolean;
  error: { code: ErrorCode; message: string; partial: boolean } | null;
}

export function fromStream(state: StreamState, slots: ModelSlot[]): AnswerView {
  return {
    text: state.text,
    slots,
    agreement: state.agreement,
    sources: state.sources,
    synthesisModel: state.synthesisModel,
    latencyMs: state.latencyMs,
    streaming: state.phase === 'models' || state.phase === 'synthesis' || state.phase === 'starting',
    cancelled: state.phase === 'cancelled',
    error: state.error,
  };
}

export function fromMessage(message: Message): AnswerView {
  return {
    text: message.content,
    slots: message.responses.map(toSlot),
    agreement: message.agreement,
    sources: message.sources,
    synthesisModel: message.synthesisModel,
    latencyMs: message.metadata?.latencyMs ?? null,
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
  return {
    model: response.model,
    phase: response.outcome === 'failed' ? 'failed' : 'complete',
    text: response.text,
    outcome: response.outcome,
    stance: response.stance,
    latencyMs: response.latencyMs,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    errorCode: response.errorCode,
    errorMessage: null,
  };
}
