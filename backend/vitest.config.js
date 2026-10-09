import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { JWT_SECRET: 'test-secret', BCRYPT_ROUNDS: '4', NODE_ENV: 'test' },
    testTimeout: 60_000,
    hookTimeout: 120_000, // first run downloads a MongoDB binary
    fileParallelism: false,
  },
});
