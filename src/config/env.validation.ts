import Joi from 'joi';

// Validated once at boot. If anything is missing or malformed the app refuses
// to start, which is much better than finding out on the first request.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_DB: Joi.number().integer().min(0).default(0),

  // The cache has its own Redis, because it may evict keys and the queue must not.
  CACHE_REDIS_HOST: Joi.string(),
  CACHE_REDIS_PORT: Joi.number().port().default(6381),
  CACHE_REDIS_DB: Joi.number().integer().min(0).default(0),
  CACHE_TTL_SECONDS: Joi.number().integer().min(1).default(3600),
  // How alike two questions must be to share an answer. Deliberately strict:
  // "advantages of X" and "disadvantages of X" measured 0.88.
  CACHE_SEMANTIC_THRESHOLD: Joi.number().min(0).max(1).default(0.93),

  DAILY_QUESTION_LIMIT: Joi.number().integer().min(1).default(30),
  DAILY_QUESTION_LIMIT_GLOBAL: Joi.number().integer().min(1).default(300),
  DAILY_UPLOAD_LIMIT: Joi.number().integer().min(1).default(20),
  MAX_DOCUMENTS_PER_USER: Joi.number().integer().min(1).default(50),
  RATE_LIMIT_MULTIPLIER: Joi.number().min(1).default(1),

  // How many reverse proxies sit in front of the app. Set to 1 behind Caddy, or
  // every visitor shares the proxy's IP address and one rate limit.
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),
  // Empty turns the /metrics endpoint off.
  METRICS_TOKEN: Joi.string().allow('').default(''),

  // Where a reverse proxy mounts the API, so Swagger's "Try it out" calls work.
  API_BASE_PATH: Joi.string().allow('').default(''),

  STORAGE_DIR: Joi.string().default('uploads'),

  // Anyone holding this secret can mint a valid token for any user.
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),

  // Used for embeddings and answers. "fake" is free and works offline, but its
  // results don't mean much.
  AI_PROVIDER: Joi.string().valid('gemini', 'fake').default('gemini'),
  GEMINI_CHAT_MODEL: Joi.string().default('gemini-3.5-flash-lite'),
  // Passages further than this from a question count as off-topic. Cosine
  // distance runs from 0 (same meaning) to 2.
  SEARCH_MAX_DISTANCE: Joi.number().min(0).max(2).default(0.4),
  GEMINI_API_KEY: Joi.when('AI_PROVIDER', {
    is: 'fake',
    // oxlint-disable-next-line unicorn/no-thenable -- this is Joi's API
    then: Joi.string().allow('').default(''),
    otherwise: Joi.string().required(),
  }),

  // Optional. Without it the app just doesn't offer Google sign-in.
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
});

export function validateEnv(env: Record<string, unknown>) {
  const { error, value } = envValidationSchema.validate(env, {
    abortEarly: false, // report every problem at once, not just the first
    allowUnknown: true, // the OS sets plenty of env vars we don't care about
  });
  if (error) {
    throw new Error(`Invalid environment configuration: ${error.message}`);
  }
  return value as Record<string, unknown>;
}
