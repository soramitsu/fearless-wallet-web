import { configDefaults, defineConfig } from 'vitest/config';

import { commonViteConfig } from './vite.config.shared.mjs';

export default defineConfig(({ mode }) => {
  const workerOverride = process.env.FEARLESS_TEST_WORKERS;
  if (workerOverride !== undefined && !/^[1-4]$/.test(workerOverride)) {
    throw new Error('FEARLESS_TEST_WORKERS must be an integer from 1 to 4');
  }
  if (workerOverride !== undefined) {
    console.info(`Using ${workerOverride} test worker(s) from FEARLESS_TEST_WORKERS`);
  }

  const config = commonViteConfig({
    mode,
    outDir: 'dist/test',
    publicDir: false,
  });

  return {
    ...config,
    test: {
      globals: true,
      // Real scrypt/HD-key regression tests need bounded CPU and memory contention.
      maxWorkers: Number(workerOverride ?? '4'),
      // The Iroha SDK must go through Vite so its native import resolves to the browser binding.
      server: { deps: { inline: ['@subwallet/keyring', '@iroha/iroha-js'] } },
      environment: 'happy-dom',
      // Git-ignored build, review and scratch output can hold old checkouts of this repository; their spec copies
      // must not run as part of the suite.
      exclude: [
        ...configDefaults.exclude,
        'build/**',
        'coverage/**',
        'output/**',
        'review-output/**',
        'review-artifacts/**',
        'test-results/**',
        'playwright-report/**',
        'tmp/**',
        '.tmp/**',
        'tmp-*/**',
        '.tmp-*/**',
        'docs/validation/**',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['lcov'],
        reportsDirectory: 'coverage',
        include: ['src/**/*.{js,jsx,ts,tsx,vue}'],
        exclude: ['src/**/*.d.ts'],
        thresholds: {
          // Repository-wide ratchet: raise these floors as legacy surfaces gain tests.
          branches: 26,
          functions: 16,
          lines: 23,
        },
      },
    },
  };
});
