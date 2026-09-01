import { ObjectId, type Collection, type Db } from 'mongodb';
import type { SessionDoc } from './types.ts';

/** A rotated token stays usable briefly: two tabs can refresh concurrently. */
export const ROTATION_GRACE_MS = 60_000;

export class SessionRepository {
  private readonly sessions: Collection<SessionDoc>;

  constructor(db: Db) {
    this.sessions = db.collection<SessionDoc>('sessions');
  }

  async create(input: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<SessionDoc> {
    const doc: SessionDoc = {
      _id: new ObjectId(),
      userId: new ObjectId(input.userId),
      tokenHash: input.tokenHash,
      familyId: input.familyId,
      rotatedAt: null,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
    };
    await this.sessions.insertOne(doc);
    return doc;
  }

  findByTokenHash(tokenHash: string): Promise<SessionDoc | null> {
    return this.sessions.findOne({ tokenHash });
  }

  findById(sessionId: string): Promise<SessionDoc | null> {
    if (!ObjectId.isValid(sessionId)) return Promise.resolve(null);
    return this.sessions.findOne({ _id: new ObjectId(sessionId) });
  }

  async markRotated(tokenHash: string): Promise<void> {
    await this.sessions.updateOne({ tokenHash }, { $set: { rotatedAt: new Date() } });
  }

  /** Reuse of a rotated token means it leaked: destroy every descendant. */
  async revokeFamily(familyId: string): Promise<number> {
    const { deletedCount } = await this.sessions.deleteMany({ familyId });
    return deletedCount;
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.sessions.deleteOne({ tokenHash });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessions.deleteMany({ userId: new ObjectId(userId) });
  }
}
