import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Real env vars win over .env, so this points every e2e test at the
    // throwaway test database.
    env: {
      NODE_ENV: 'test',
      DATABASE_NAME: 'docintel_test',
      LOG_LEVEL: 'warn',
      REDIS_DB: '1',
      CACHE_REDIS_DB: '1',
      RATE_LIMIT_MULTIPLIER: '1000',
      DAILY_QUESTION_LIMIT: '100000',
      DAILY_QUESTION_LIMIT_GLOBAL: '100000',
      DAILY_UPLOAD_LIMIT: '100000',
      MAX_DOCUMENTS_PER_USER: '100000',
      CACHE_REDIS_HOST: 'localhost',
      AI_PROVIDER: 'fake',
      SEARCH_MAX_DISTANCE: '0.9',
      GOOGLE_CLIENT_ID: 'test-client-id',
      STORAGE_DIR: 'uploads/test',
    },
    // Test files share one database, so run them one after another.
    fileParallelism: false,
  },
});
