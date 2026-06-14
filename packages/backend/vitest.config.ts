import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    env: {
      MP_ACCESS_TOKEN: 'test-mp-token',
      MP_SANDBOX: 'false',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/services/**/*.ts', 'src/lib/jwt.ts'],
      reportsDirectory: 'coverage',
    },
  },
});
