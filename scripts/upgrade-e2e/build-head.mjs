#!/usr/bin/env node
// Builds this tree's production extension for the upgrade E2E into dist/extension/chrome-upgrade-e2e, with the same
// test manifest key the legacy builds carry (build-legacy.mjs), so it replaces them under the same extension id.
// dist/extension/chrome, the release artifact, is never touched.
//
// Usage: node scripts/upgrade-e2e/build-head.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TEST_OAUTH_CLIENT_ID, root, testExtensionKey } from './config.mjs';

export const HEAD_OUTPUT_DIR = 'chrome-upgrade-e2e';
export const headBuildDir = () =>
  process.env.UPGRADE_E2E_HEAD_BUILD || path.join(root, 'dist/extension', HEAD_OUTPUT_DIR);

export function buildHead() {
  const env = {
    ...process.env,
    EXTENSION_TYPE: 'chrome',
    OUTPUT_DIR: HEAD_OUTPUT_DIR,
    IS_EXTENSION: 'true',
    EXTENSION_PUBLIC_KEY: testExtensionKey(),
    OAUTH_CLIENT_ID: TEST_OAUTH_CLIENT_ID,
  };
  // The same command as `yarn build:extension`; production mode applies the release flags itself.
  const result = spawnSync(
    path.join(root, 'node_modules/.bin/env-cmd'),
    ['-f', '.env.extension', process.execPath, 'scripts/build-extension.mjs', '--mode', 'production'],
    { cwd: root, env, stdio: 'inherit' }
  );
  if (result.status !== 0) throw new Error(`the production build failed (${result.status})`);
  const dir = headBuildDir();
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const provenance = {
    commit: git(['rev-parse', 'HEAD']),
    dirty: git(['status', '--porcelain=v1', '--untracked-files=no']).length > 0,
    manifestVersion: manifest.version,
    node: process.version,
    builtAt: new Date().toISOString(),
  };
  writeFileSync(path.join(dir, 'upgrade-e2e-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  return { dir, provenance };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(path.join(root, 'node_modules/.bin/env-cmd')))
    throw new Error('install dependencies first (corepack yarn install --immutable)');
  const { dir, provenance } = buildHead();
  console.log(
    `built ${provenance.manifestVersion} from ${provenance.commit.slice(0, 8)}${provenance.dirty ? ' (with uncommitted changes)' : ''} in ${dir}`
  );
}
