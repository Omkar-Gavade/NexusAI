import type { ObjectId } from 'mongodb';
import type {
  Agreement,
  MessageStatus,
  ModelOutcome,
  ModelRef,
  Source,
  Stance,
  UserPreferences,
} from '@nexusai/contracts';

export interface UserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  displayName: string;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  /** All tokens descended from one login. Reuse detection kills the family. */
  familyId: string;
  /** Set when this token is rotated; the row lingers for the grace window. */
  rotatedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface ConversationDoc {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One model's attempt, recorded as it actually happened. */
export interface ModelResponseDoc {
  model: ModelRef;
  text: string;
  outcome: ModelOutcome;
  stance: Stance;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
}

export interface MessageDoc {
  _id: ObjectId;
  conversationId: ObjectId;
  /** Denormalised so authorization is one indexed query, never a join. */
  userId: ObjectId;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;
  /** Present only on user messages; enforces send idempotency. */
  clientMessageId: string | null;
  synthesisModel: ModelRef | null;
  responses: ModelResponseDoc[];
  agreement: Agreement | null;
  sources: Source[];
  metadata: {
    latencyMs: number;
    firstTokenMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  } | null;
  createdAt: Date;
}
