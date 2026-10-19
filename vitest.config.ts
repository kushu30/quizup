import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@quizup/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/shared/src/**/*.test.ts', 'apps/server/src/**/*.test.ts'],
    env: {
      PORT: '4999',
      CORS_ORIGINS: 'http://localhost:5173',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
  },
});
