import { z } from 'zod';

/**
 * Environment is validated once, at boot, and the process exits if it is wrong.
 *
 * A server that starts with a broken configuration and fails later at request
 * time is far harder to diagnose than one that refuses to start.
 */
function unescapeNewlines(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
}

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1).default('nexusai'),

  /** Exact origin of the frontend. Never a wildcard, never reflected. */
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  /**
   * Whether `X-Forwarded-For` may be believed, and from how far.
   *
   * Rate limits for unauthenticated traffic — registration and login, the
   * credential-stuffing surface — are keyed on `request.ip`. Behind a proxy
   * that is the proxy's address unless this is set, so every visitor shares one
   * bucket. Trusting the header unconditionally is the worse failure: if the
   * service is ever reachable directly, a client sets its own
   * `X-Forwarded-For` per request and the limit never triggers at all.
   *
   * So it fails closed. `false` (the default) means the socket address is used.
   * A number is the count of trusted proxy hops — `1` for a single load
   * balancer, which is the common case. A comma-separated list of addresses or
   * CIDRs trusts exactly those. `true` trusts any hop and should be used only
   * when the service cannot be reached except through the proxy.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((raw): boolean | number | string[] => {
      const value = raw.trim();
      if (value === '' || value === 'false') return false;
      if (value === 'true') return true;
      if (/^\d+$/.test(value)) return Number(value);
      return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }),

  /**
   * Ed25519 PKCS#8 / SPKI, PEM. Generate with `pnpm backend:keys`.
   * Accepts either real newlines or the escaped \n form that env files and
   * secret managers use.
   */
  JWT_PRIVATE_KEY: z.string().min(1).transform(unescapeNewlines),
  JWT_PUBLIC_KEY: z.string().min(1).transform(unescapeNewlines),
  JWT_ISSUER: z.string().default('nexusai'),
  JWT_AUDIENCE: z.string().default('nexusai-web'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),

  // Provider credentials. All optional: the registry reports NOT_CONFIGURED for
  // any provider without a key, and `auto.available` goes false when nothing is
  // routable. That is a real state the frontend already renders.
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),

  /** Deterministic in-process adapter. Refused in production (see below). */
  TEST_PROVIDER_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Cost and abuse controls. The backend is authoritative; the frontend's
  // limits are a courtesy, not a boundary.
  MAX_MODELS_PER_REQUEST: z.coerce.number().int().min(1).max(8).default(5),
  MAX_CONCURRENT_MODEL_CALLS: z.coerce.number().int().min(1).max(8).default(4),
  MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  SYNTHESIS_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  ORCHESTRATION_TIMEOUT_MS: z.coerce.number().int().positive().default(150_000),
  MAX_HISTORY_MESSAGES: z.coerce.number().int().positive().default(20),
  MAX_HISTORY_CHARS: z.coerce.number().int().positive().default(24_000),
  MAX_CONCURRENT_STREAMS_PER_USER: z.coerce.number().int().positive().default(3),
});

export type Config = Readonly<z.infer<typeof Schema>>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.safeParse(env);

  if (!parsed.success) {
    // Names only. Printing values would put secrets in the crash output.
    const names = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    process.stderr.write(`\nInvalid environment configuration:\n${names.join('\n')}\n\n`);
    process.exit(1);
  }

  const config = parsed.data;

  // The test adapter returns canned text. In production that would be a
  // fabricated model response, which is the one thing this product must never
  // do — so it is refused rather than warned about.
  if (config.NODE_ENV === 'production' && config.TEST_PROVIDER_ENABLED) {
    process.stderr.write('\nTEST_PROVIDER_ENABLED must be false in production.\n\n');
    process.exit(1);
  }

  return Object.freeze(config);
}
