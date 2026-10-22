import { defineConfig } from 'vitest/config';

import { commonViteConfig } from './vite.config.shared.mjs';

export default defineConfig(({ mode }) => {
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
      maxWorkers: 4,
      // The Iroha SDK must go through Vite so its native import resolves to the browser binding.
      server: { deps: { inline: ['@subwallet/keyring', '@iroha/iroha-js'] } },
      environment: 'happy-dom',
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
