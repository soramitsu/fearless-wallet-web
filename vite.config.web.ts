import path from 'node:path';
import { defineConfig } from 'vite';

import { commonViteConfig } from './vite.config.shared.mjs';
import { copyLicenseAssets } from './scripts/copy-license-assets.mjs';

export default defineConfig(({ mode }) => {
  const config = commonViteConfig({
    mode,
    outDir: 'dist/web',
    publicDir: 'public',
  });

  return {
    ...config,
    base: './',
    plugins: [
      ...config.plugins,
      {
        name: 'fearless-web-license-assets',
        apply: 'build',
        closeBundle: () => copyLicenseAssets({ sourceRoot: __dirname, outDir: path.resolve(__dirname, 'dist/web') }),
      },
    ],
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
