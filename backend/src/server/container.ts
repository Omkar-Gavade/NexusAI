import type { Db } from 'mongodb';
import type { Config } from '../config/env.ts';
import { AuthService } from '../application/auth-service.ts';
import { ConversationService } from '../application/conversation-service.ts';
import { createTokenService, type TokenService } from '../domain/auth/tokens.ts';
import { ChatOrchestrator } from '../domain/orchestration/orchestrator.ts';
import { PROVIDER_KEY_ENV, type ProviderId } from '../domain/models/catalog.ts';
import { ModelRegistry } from '../domain/models/registry.ts';
import type { ProviderAdapter } from '../infrastructure/llm/adapter.ts';
import { AnthropicAdapter } from '../infrastructure/llm/adapters/anthropic.ts';
import { GoogleAdapter } from '../infrastructure/llm/adapters/google.ts';
import {
  OPENAI_COMPATIBLE_BASE_URLS,
  OpenAICompatibleAdapter,
} from '../infrastructure/llm/adapters/openai-compatible.ts';
import { TestAdapter } from '../infrastructure/llm/adapters/test-adapter.ts';
import type { Logger } from '../infrastructure/observability/logger.ts';
import { ConversationRepository } from '../infrastructure/repositories/conversation-repository.ts';
import { MessageRepository } from '../infrastructure/repositories/message-repository.ts';
import { SessionRepository } from '../infrastructure/repositories/session-repository.ts';
import { UserRepository } from '../infrastructure/repositories/user-repository.ts';
import { RateLimiter } from '../api/middleware/rate-limit.ts';

export interface Container {
  readonly config: Config;
  readonly logger: Logger;
  readonly db: Db;
  readonly tokens: TokenService;
  readonly registry: ModelRegistry;
  readonly auth: AuthService;
  readonly conversations: ConversationService;
  readonly orchestrator: ChatOrchestrator;
  readonly limiter: RateLimiter;
  /** Present only when TEST_PROVIDER_ENABLED; lets tests program behaviour. */
  readonly testAdapter: TestAdapter | null;
}

/**
 * The composition root — 60 lines of explicit wiring instead of a DI container.
 * Every dependency is visible here, and the object graph is a value rather than
 * a runtime resolution the reader has to simulate in their head.
 */
export async function buildContainer(input: {
  config: Config;
  logger: Logger;
  db: Db;
}): Promise<Container> {
  const { config, logger, db } = input;

  const adapters = new Map<string, ProviderAdapter>();

  for (const [provider, baseUrl] of Object.entries(OPENAI_COMPATIBLE_BASE_URLS)) {
    const key = keyFor(config, provider as ProviderId);
    adapters.set(provider, new OpenAICompatibleAdapter(provider, baseUrl, key));
  }
  adapters.set('anthropic', new AnthropicAdapter(config.ANTHROPIC_API_KEY));
  adapters.set('google', new GoogleAdapter(config.GEMINI_API_KEY));

  const testAdapter = config.TEST_PROVIDER_ENABLED ? new TestAdapter() : null;
  if (testAdapter) adapters.set('test', testAdapter);

  const registry = new ModelRegistry(config, adapters);
  const tokens = await createTokenService(config);

  const users = new UserRepository(db);
  const sessions = new SessionRepository(db);
  const conversationRepo = new ConversationRepository(db);
  const messageRepo = new MessageRepository(db);

  return {
    config,
    logger,
    db,
    tokens,
    registry,
    testAdapter,
    limiter: new RateLimiter(),
    auth: new AuthService({ config, users, sessions, tokens }),
    conversations: new ConversationService({
      conversations: conversationRepo,
      messages: messageRepo,
    }),
    orchestrator: new ChatOrchestrator({
      config,
      registry,
      conversations: conversationRepo,
      messages: messageRepo,
      logger,
    }),
  };
}

/** Keys are read here and nowhere else; no module reaches into process.env. */
function keyFor(config: Config, provider: ProviderId): string | undefined {
  const name = PROVIDER_KEY_ENV[provider];
  if (!name) return undefined;
  return (config as unknown as Record<string, string | undefined>)[name];
}
