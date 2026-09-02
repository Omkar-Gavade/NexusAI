import { ObjectId, type Db, type Collection } from 'mongodb';
import type { UserPreferences } from '@nexusai/contracts';
import type { UserDoc } from './types.ts';

const CI = { locale: 'en', strength: 2 } as const;

export class UserRepository {
  private readonly users: Collection<UserDoc>;

  constructor(db: Db) {
    this.users = db.collection<UserDoc>('users');
  }

  /** Collation matches the unique index, so lookup and constraint agree. */
  findByEmail(email: string): Promise<UserDoc | null> {
    return this.users.findOne({ email }, { collation: CI });
  }

  findById(userId: string): Promise<UserDoc | null> {
    if (!ObjectId.isValid(userId)) return Promise.resolve(null);
    return this.users.findOne({ _id: new ObjectId(userId) });
  }

  async create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
    preferences: UserPreferences;
  }): Promise<UserDoc> {
    const now = new Date();
    const doc: UserDoc = { _id: new ObjectId(), ...input, createdAt: now, updatedAt: now };
    await this.users.insertOne(doc);
    return doc;
  }

  async update(
    userId: string,
    patch: { displayName?: string; preferences?: UserPreferences; passwordHash?: string },
  ): Promise<UserDoc | null> {
    return this.users.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: { ...patch, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
  }
}
