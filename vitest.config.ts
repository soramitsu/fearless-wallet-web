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
      environment: 'happy-dom',
      // A test that imports a key encoder module directly gets it with the build's scrypt rewrite
      // (scripts/keystore-scrypt-params.mjs); Node would load the package file unchanged.
      server: {
        deps: {
          inline: [
            // Exercise the installed keyring in storage tests through the same compatibility
            // transforms and scrypt parameters as the extension build.
            '@subwallet/ui-keyring',
            '@subwallet/keyring',
            /\/node_modules\/@(?:subwallet|polkadot)\/keyring\/pair\/encode\.js$/,
            /\/node_modules\/@polkadot\/util-crypto\/json\/encrypt\.js$/,
            /\/node_modules\/@polkadot\/util-crypto\/scrypt\/(?:defaults|encode)\.js$/,
          ],
        },
      },
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
