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

  // Anyone holding this secret can mint a valid token for any user.
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),

  // Optional until the app calls Gemini. Tests will use a fake provider.
  GEMINI_API_KEY: Joi.string().allow('').default(''),
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
