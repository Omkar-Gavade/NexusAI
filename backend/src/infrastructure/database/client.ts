import { MongoClient, type Db } from 'mongodb';
import type { Config } from '../../config/env.ts';

export interface Database {
  readonly client: MongoClient;
  readonly db: Db;
  close(): Promise<void>;
}

export async function connect(config: Config): Promise<Database> {
  const client = new MongoClient(config.MONGODB_URI, {
    // Bounded pool: a request can hold a connection while it writes, but never
    // while it waits on a model provider (see ORCHESTRATION in the handoff).
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5_000,
    retryWrites: true,
  });

  await client.connect();
  const db = client.db(config.MONGODB_DB_NAME);
  await db.command({ ping: 1 });

  return {
    client,
    db,
    close: () => client.close(),
  };
}
