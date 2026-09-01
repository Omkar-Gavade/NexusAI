import type {
  Agreement,
  ChatEvent,
  ErrorCode,
  ModelOutcome,
  ModelRef,
  Source,
  Stance,
} from '@nexusai/contracts';

export type StreamPhase =
  | 'idle'
  | 'starting'
  | 'models'
  | 'synthesis'
  | 'complete'
  | 'cancelled'
  | 'error';

export interface ModelSlot {
  model: ModelRef;
  phase: 'queued' | 'running' | 'complete' | 'failed';
  text: string;
  outcome: ModelOutcome | null;
  stance: Stance;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: ErrorCode | null;
  errorMessage: string | null;
}

export interface StreamState {
  phase: StreamPhase;
  conversationId: string | null;
  messageId: string | null;
  /** Fixed order for the life of the message: position identifies a model. */
  plan: ModelRef[];
  models: Record<string, ModelSlot>;
  synthesisModel: ModelRef | null;
  /** Synthesis text. Per-model text lives on its slot. */
  text: string;
  agreement: Agreement | null;
  sources: Source[];
  error: { code: ErrorCode; message: string; partial: boolean } | null;
  latencyMs: number | null;
  firstTokenMs: number | null;
}

export const initialStreamState: StreamState = {
  phase: 'idle',
  conversationId: null,
  messageId: null,
  plan: [],
  models: {},
  synthesisModel: null,
  text: '',
  agreement: null,
  sources: [],
  error: null,
  latencyMs: null,
  firstTokenMs: null,
};

export type StreamAction =
  | { kind: 'event'; event: ChatEvent }
  | { kind: 'reset' }
  /** Local abort: the socket may close before a `cancelled` frame arrives. */
  | { kind: 'abort' };

function slot(model: ModelRef): ModelSlot {
  return {
    model,
    phase: 'queued',
    text: '',
    outcome: null,
    stance: 'unknown',
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    errorCode: null,
    errorMessage: null,
  };
}

/** Terminal phases ignore further events rather than throwing. */
function isTerminal(phase: StreamPhase): boolean {
  return phase === 'complete' || phase === 'cancelled' || phase === 'error';
}

function patchSlot(
  state: StreamState,
  modelId: string,
  patch: Partial<ModelSlot>,
): Record<string, ModelSlot> {
  const existing = state.models[modelId];
  if (!existing) return state.models;
  return { ...state.models, [modelId]: { ...existing, ...patch } };
}

/**
 * Pure: no fetch, no DOM, no timers. Every illegal transition is defined rather
 * than left to crash — a stray delta after completion is dropped, and a
 * completion with no text yields an error state instead of an empty answer.
 */
export function reduce(state: StreamState, action: StreamAction): StreamState {
  if (action.kind === 'reset') return initialStreamState;

  if (action.kind === 'abort') {
    if (state.phase === 'idle' || isTerminal(state.phase)) return state;
    return { ...state, phase: 'cancelled' };
  }

  const { event } = action;

  switch (event.type) {
    case 'start': {
      const models: Record<string, ModelSlot> = {};
      for (const model of event.plan) models[model.modelId] = slot(model);
      return {
        ...initialStreamState,
        phase: 'models',
        conversationId: event.conversationId,
        messageId: event.messageId,
        plan: event.plan,
        models,
      };
    }

    case 'model_start':
      if (isTerminal(state.phase)) return state;
      return { ...state, models: patchSlot(state, event.modelId, { phase: 'running' }) };

    case 'model_complete':
      if (isTerminal(state.phase)) return state;
      return {
        ...state,
        models: patchSlot(state, event.modelId, {
          phase: 'complete',
          text: event.text,
          outcome: event.outcome,
          latencyMs: event.latencyMs,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
        }),
      };

    case 'model_error':
      if (isTerminal(state.phase)) return state;
      return {
        ...state,
        models: patchSlot(state, event.modelId, {
          phase: 'failed',
          outcome: 'failed',
          errorCode: event.code,
          errorMessage: event.message,
        }),
      };

    case 'synthesis_start':
      if (isTerminal(state.phase)) return state;
      return { ...state, phase: 'synthesis', synthesisModel: event.model };

    case 'delta':
      // A delta before synthesis_start means the server reordered frames; take
      // the text rather than dropping the user's answer on the floor.
      if (isTerminal(state.phase)) return state;
      return { ...state, phase: 'synthesis', text: state.text + event.text };

    case 'agreement': {
      if (isTerminal(state.phase)) return state;
      const models = { ...state.models };
      for (const [modelId, stance] of Object.entries(event.stances)) {
        const existing = models[modelId];
        if (existing) models[modelId] = { ...existing, stance };
      }
      return { ...state, agreement: event.agreement, models };
    }

    case 'sources':
      if (isTerminal(state.phase)) return state;
      return { ...state, sources: event.sources };

    case 'complete':
      if (isTerminal(state.phase)) return state;
      // Completing with no synthesis text is a failure wearing a success frame.
      if (state.text.length === 0) {
        return {
          ...state,
          phase: 'error',
          error: {
            code: 'SYNTHESIS_FAILED',
            message: "The individual responses arrived, but couldn't be reconciled.",
            partial: false,
          },
          latencyMs: event.latencyMs,
        };
      }
      return {
        ...state,
        phase: 'complete',
        messageId: event.messageId,
        latencyMs: event.latencyMs,
        firstTokenMs: event.firstTokenMs,
      };

    case 'cancelled':
      if (state.phase === 'complete' || state.phase === 'error') return state;
      return {
        ...state,
        phase: 'cancelled',
        messageId: event.messageId,
        latencyMs: event.latencyMs,
      };

    case 'error':
      if (isTerminal(state.phase)) return state;
      return {
        ...state,
        phase: 'error',
        error: { code: event.code, message: event.message, partial: event.partial },
      };

    default: {
      // Exhaustiveness: adding a ChatEvent variant without handling it here is a
      // compile error, not a silent no-op at runtime.
      const unhandled: never = event;
      void unhandled;
      return state;
    }
  }
}

/** Models in plan order — never Object.values, whose order is not guaranteed. */
export function orderedSlots(state: StreamState): ModelSlot[] {
  return state.plan.flatMap((model) => {
    const found = state.models[model.modelId];
    return found ? [found] : [];
  });
}

export function isStreaming(phase: StreamPhase): boolean {
  return phase === 'starting' || phase === 'models' || phase === 'synthesis';
}
