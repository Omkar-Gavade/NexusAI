import { randomUUID, generateKeyPairSync } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { MongoClient, type Db } from 'mongodb';
import { loadConfig, type Config } from '../../src/config/env.ts';
import { ensureIndexes } from '../../src/infrastructure/database/indexes.ts';
import { createLogger } from '../../src/infrastructure/observability/logger.ts';
import { buildApp } from '../../src/server/app.ts';
import { buildContainer, type Container } from '../../src/server/container.ts';
import type { TestAdapter } from '../../src/infrastructure/llm/adapters/test-adapter.ts';

const MONGO_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const ORIGIN = 'http://localhost:5173';

const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export interface Harness {
  app: FastifyInstance;
  container: Container;
  config: Config;
  db: Db;
  testAdapter: TestAdapter;
  close(): Promise<void>;
}

/**
 * A real app against a real MongoDB, on a database unique to the caller.
 *
 * No mocked repositories: index behaviour, collation and unique constraints are
 * exactly the things worth testing here, and a fake repository reproduces none
 * of them.
 */
export async function createHarness(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<Harness> {
  const dbName = `nexusai_test_${randomUUID().slice(0, 8)}`;

  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: MONGO_URI,
    MONGODB_DB_NAME: dbName,
    WEB_ORIGIN: ORIGIN,
    JWT_PRIVATE_KEY: privateKey,
    JWT_PUBLIC_KEY: publicKey,
    LOG_LEVEL: 'fatal',
    TEST_PROVIDER_ENABLED: 'true',
    ...overrides,
  } as NodeJS.ProcessEnv);

  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(dbName);
  await ensureIndexes(db);

  const container = await buildContainer({ config, logger: createLogger(config), db });
  const app = await buildApp(container);
  await app.ready();

  return {
    app,
    container,
    config,
    db,
    testAdapter: container.testAdapter!,
    async close() {
      await app.close();
      await db.dropDatabase();
      await client.close();
    },
  };
}

/** Keeps cookies across calls, the way a browser would. */
export class Client {
  private cookies = new Map<string, string>();

  constructor(private readonly app: FastifyInstance) {}

  private header(): Record<string, string> {
    if (this.cookies.size === 0) return {};
    return {
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    };
  }

  private capture(raw: string[] | string | undefined): void {
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const entry of list) {
      const [pair] = entry.split(';');
      const index = pair!.indexOf('=');
      const name = pair!.slice(0, index);
      const value = pair!.slice(index + 1);
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  clearCookie(name: string): void {
    this.cookies.delete(name);
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ): Promise<{ status: number; body: any; headers: Record<string, unknown> }> {
    const response = await this.app.inject({
      method,
      url,
      headers: {
        'x-nexus-client': 'web',
        origin: ORIGIN,
        ...this.header(),
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });

    this.capture(response.headers['set-cookie'] as string[] | string | undefined);

    let body: unknown = null;
    if (response.body) {
      try {
        body = JSON.parse(response.body);
      } catch {
        body = response.body;
      }
    }
    return { status: response.statusCode, body, headers: response.headers };
  }

  get = (url: string) => this.request('GET', url);
  post = (url: string, payload?: unknown) => this.request('POST', url, payload);
  patch = (url: string, payload?: unknown) => this.request('PATCH', url, payload);
  delete = (url: string) => this.request('DELETE', url);

  /** Registers a fresh account and keeps its session. */
  async signUp(email = `u${randomUUID().slice(0, 8)}@example.com`) {
    const res = await this.post('/api/auth/register', {
      email,
      password: 'correct-horse-battery',
      displayName: 'Test User',
    });
    return { email, status: res.status, user: res.body?.user };
  }
}

export function ulid(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  return Array.from({ length: 26 }, () => alphabet[Math.floor(Math.random() * 32)]).join('');
}

/** Parses an injected SSE body into typed events. */
export function parseSse(body: string): Array<Record<string, any>> {
  const events: Array<Record<string, any>> = [];
  for (const frame of body.split(/\r?\n\r?\n/)) {
    for (const line of frame.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      try {
        events.push(JSON.parse(line.slice(5).trim()));
      } catch {
        /* a partial frame at the tail is not an event */
      }
    }
  }
  return events;
}
