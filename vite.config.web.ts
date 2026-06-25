import path from 'node:path';
import { defineConfig } from 'vite';

import { commonViteConfig } from './vite.config.shared.mjs';

export default defineConfig(({ mode }) => {
  const config = commonViteConfig({
    mode,
    outDir: 'dist/web',
    publicDir: 'public',
  });

  return {
    ...config,
    base: './',
    build: {
      ...config.build,
      rollupOptions: {
        ...config.build.rollupOptions,
        input: {
          index: path.resolve(__dirname, 'index.html'),
          'service-worker': path.resolve(__dirname, 'src/extension/entry/background-web.ts'),
        },
      },
    },
  };
});
