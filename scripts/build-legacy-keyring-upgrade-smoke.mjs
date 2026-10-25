import { build } from 'vite';
import { commonViteConfig } from '../vite.config.shared.mjs';

process.env.IS_EXTENSION = 'false';
const config = commonViteConfig({ mode: 'test', outDir: 'output/playwright/legacy-upgrade-20260906/site', publicDir: false });
await build({
  ...config,
  configFile: false,
  base: './',
  build: {
    ...config.build,
    rollupOptions: { ...config.build.rollupOptions, input: 'tests/browser/legacy-keyring-upgrade.html' },
  },
});
