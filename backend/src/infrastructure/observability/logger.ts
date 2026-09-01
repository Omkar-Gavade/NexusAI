import { pino, type Logger, type LoggerOptions } from 'pino';
import type { Config } from '../../config/env.ts';

/**
 * Provider keys are the highest-value secret in the system and can reach a log
 * through a field nobody anticipated. Path-based redaction assumes we predicted
 * every path; this pattern pass assumes we did not.
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[\w-]{16,}/g,
  /sk-[A-Za-z0-9]{16,}/g,
  /AIza[\w-]{30,}/g,
  /gsk_[A-Za-z0-9]{16,}/g,
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, // JWTs
];

function scrub(value: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[REDACTED]'), value);
}

function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (typeof value === 'string') return scrub(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubDeep(v, depth + 1)]),
    );
  }
  return value;
}

/**
 * Pino options rather than an instance.
 *
 * Handing Fastify a constructed logger changes its generic parameter, which
 * then propagates into every route module's FastifyInstance type. Passing the
 * options keeps the default FastifyBaseLogger everywhere while preserving the
 * redaction and scrubbing below.
 */
export function loggerOptions(config: Config): LoggerOptions {
  return {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        'password',
        '*.password',
        'passwordHash',
        '*.passwordHash',
        'apiKey',
        '*.apiKey',
        'accessToken',
        'refreshToken',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label: string) => ({ level: label }),
      log: (object: Record<string, unknown>) => scrubDeep(object) as Record<string, unknown>,
    },
    base: null,
  };
}

export function createLogger(config: Config): Logger {
  return pino(loggerOptions(config));
}

export type { Logger };
