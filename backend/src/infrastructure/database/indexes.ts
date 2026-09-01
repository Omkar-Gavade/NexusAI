import type { Db } from 'mongodb';

/**
 * Schema management for MongoDB is index creation, and it is idempotent, so it
 * runs at boot rather than through a separate migration tool. A migration
 * framework here would be one command that only ever creates indexes.
 *
 * Any future change that is *not* idempotent — a backfill, a field rename —
 * gets a numbered script under backend/migrations/ and is run explicitly.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection('users').createIndexes([
    {
      key: { email: 1 },
      name: 'email_unique_ci',
      unique: true,
      // Case-insensitive: Omkar@x.com and omkar@x.com are one account.
      collation: { locale: 'en', strength: 2 },
    },
  ]);

  await db.collection('sessions').createIndexes([
    { key: { tokenHash: 1 }, name: 'tokenHash_unique', unique: true },
    { key: { familyId: 1 }, name: 'familyId' },
    { key: { userId: 1 }, name: 'userId' },
    // Mongo's TTL monitor reaps expired sessions. This is what replaces Redis
    // key expiry — see ADR-013.
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ]);

  await db.collection('conversations').createIndexes([
    // The sidebar query: this user's conversations, newest first.
    { key: { userId: 1, updatedAt: -1 }, name: 'userId_updatedAt' },
  ]);

  // Superseded by conversationId_createdAt_id below, which matches the sort
  // direction and so removes a blocking in-memory sort. Dropped rather than
  // left alongside it: everything the old index served, the new one serves.
  await dropIfPresent(db, 'messages', 'conversationId_createdAt');

  await db.collection('messages').createIndexes([
    // History and context assembly, both ordered within one conversation.
    //
    // The key order matches the query's sort exactly — `{ createdAt: -1,
    // _id: -1 }` — which is what keeps it index-ordered. With the ascending
    // form, MongoDB satisfied the filter from the index but then sorted in
    // memory: returning one 30-message page of a 4,000-message conversation
    // examined and fetched all 4,000 documents. Measured, not assumed.
    { key: { conversationId: 1, createdAt: -1, _id: -1 }, name: 'conversationId_createdAt_id' },
    // userId is denormalised onto messages so authorization is a single
    // indexed query rather than a join through conversations.
    { key: { userId: 1 }, name: 'userId' },
    {
      key: { userId: 1, clientMessageId: 1 },
      name: 'idempotency',
      unique: true,
      // Only user messages carry a clientMessageId; assistant rows must not
      // collide on null.
      partialFilterExpression: { clientMessageId: { $type: 'string' } },
    },
  ]);
}

/**
 * Drops an index that a later definition replaced.
 *
 * Idempotent in both directions: on a database created before the change the
 * index exists and is removed; on a fresh one it does not. Both "no such index"
 * and "no such collection" are the success case for a fresh install — the
 * collection is created lazily by the first write, so on first boot it is not
 * there yet. Anything else is a real failure and is raised.
 */
async function dropIfPresent(db: Db, collection: string, name: string): Promise<void> {
  try {
    await db.collection(collection).dropIndex(name);
  } catch (error) {
    const code = (error as { codeName?: string })?.codeName;
    if (code !== 'IndexNotFound' && code !== 'NamespaceNotFound') throw error;
  }
}
