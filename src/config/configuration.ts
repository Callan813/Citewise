// Turns flat env vars into a typed, nested object. The rest of the app reads
// config through ConfigService<AppConfig> and never touches process.env directly.
export const configuration = () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  database: {
    host: process.env.DATABASE_HOST!,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER!,
    password: process.env.DATABASE_PASSWORD!,
    name: process.env.DATABASE_NAME!,
  },
  redis: {
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
  },
});

export type AppConfig = ReturnType<typeof configuration>;
