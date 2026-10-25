import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serialVueBuildConfig } from '../../scripts/upgrade-e2e/legacy-build-compat.mjs';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('historical Vue compiler compatibility', () => {
  it('changes only worker scheduling without touching historical source or compiler hooks', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'legacy-vue-build-'));
    dirs.push(dir);
    const originalPath = path.join(dir, 'vue.config.extension.js');
    const source = `module.exports = {
      parallel: true,
      productionSourceMap: false,
      pages: { background: { entry: 'src/background.ts' } },
      chainWebpack: function chainWebpack() {},
      configureWebpack: function configureWebpack() {},
    };`;
    writeFileSync(originalPath, source);
    const result = serialVueBuildConfig(dir);
    const require = createRequire(import.meta.url);
    const original = require(originalPath);
    const wrapped = require(result.env.VUE_CLI_SERVICE_CONFIG_PATH);

    expect(wrapped).toEqual({ ...original, parallel: false });
    expect(wrapped.pages).toBe(original.pages);
    expect(wrapped.chainWebpack).toBe(original.chainWebpack);
    expect(wrapped.configureWebpack).toBe(original.configureWebpack);
    expect(readFileSync(originalPath, 'utf8')).toBe(source);
    expect(result.env.IS_EXTENSION).toBe('true');
    expect(result.args).toEqual([
      'exec',
      'env-cmd',
      '--no-override',
      '-f',
      '.env.extension',
      'vue-cli-service',
      '--env.NODE_ENV=production',
      'build',
    ]);
    expect(result.deviation).toContain('original source, lockfile, type checks and production optimizations preserved');
  });
});
