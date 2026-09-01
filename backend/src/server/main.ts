import { loadConfig } from '../config/env.ts';
import { connect } from '../infrastructure/database/client.ts';
import { ensureIndexes } from '../infrastructure/database/indexes.ts';
import { createLogger } from '../infrastructure/observability/logger.ts';
import { MessageRepository } from '../infrastructure/repositories/message-repository.ts';
import { buildApp } from './app.ts';
import { buildContainer } from './container.ts';

const config = loadConfig();
const logger = createLogger(config);

const database = await connect(config);
await ensureIndexes(database.db);

// Belt and braces: assistant rows are inserted terminal, so this should find
// nothing. If it ever does, something wrote a non-terminal status.
const swept = await new MessageRepository(database.db).sweepIncomplete();
if (swept > 0) logger.warn({ swept }, 'finalised messages left non-terminal by a previous run');

const container = await buildContainer({ config, logger, db: database.db });

// A production server with nothing to route to cannot answer a single chat
// request. Failing at boot is far better than starting and disabling the
// composer for every user — and it is what stops a missing key from being
// papered over by the test adapter, which config already refuses here.
if (config.NODE_ENV === 'production' && container.registry.routable().length === 0) {
  logger.fatal(
    'No model provider is configured. Set at least one provider API key. ' +
      'See backend/.env.example.',
  );
  await database.close();
  process.exit(1);
}

const app = await buildApp(container);

const sweepTimer = setInterval(() => container.limiter.sweep(), 60_000);
sweepTimer.unref();

await app.listen({ port: config.PORT, host: '0.0.0.0' });

logger.info(
  {
    port: config.PORT,
    routableModels: container.registry.routable().length,
    autoAvailable: container.registry.autoAvailable(),
  },
  'nexusai backend listening',
);

let shuttingDown = false;

/**
 * Stop accepting work, let in-flight requests finish, then close resources.
 *
 * Fastify's close() drains open connections, which aborts live SSE streams —
 * that closes the request socket, which is exactly the cancellation signal the
 * orchestrator listens for, so provider calls stop rather than running on.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  clearInterval(sweepTimer);
  const timer = setTimeout(() => {
    logger.error('shutdown timed out; exiting');
    process.exit(1);
  }, 15_000);
  timer.unref();

  try {
    await app.close();
    await database.close();
    logger.info('shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'shutdown failed');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
