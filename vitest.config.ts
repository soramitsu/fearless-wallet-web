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
      coverage: {
        provider: 'v8',
        reporter: ['lcov'],
        reportsDirectory: 'coverage',
        include: ['src/**/*.{js,jsx,ts,tsx,vue}'],
        exclude: ['src/**/*.d.ts'],
      },
    },
  };
});
