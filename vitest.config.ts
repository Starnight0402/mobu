import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/setup/timezone.ts'],
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        // Real Convex queries/mutations against the real schema, in memory.
        test: {
          name: 'convex',
          environment: 'edge-runtime',
          include: ['tests/convex/**/*.test.ts'],
          server: { deps: { inline: ['convex-test'] } },
        },
      },
      {
        // Time budgets on the heavy pure functions. Kept separate so a slow
        // CI box shows up as "perf" failing, not as a flaky unit test.
        test: {
          name: 'perf',
          environment: 'node',
          include: ['tests/perf/**/*.test.ts'],
          testTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'convex/**'],
      exclude: ['convex/_generated/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
