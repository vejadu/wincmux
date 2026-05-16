import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Only measure coverage on testable logic files; exclude React/Ink UI and type declarations
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/tui/**',
        'src/types.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
      reporter: ['text', 'lcov'],
    },
  },
});
