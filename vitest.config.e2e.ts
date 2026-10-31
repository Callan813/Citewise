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
    },
    // Test files share one database, so run them one after another.
    fileParallelism: false,
  },
});
