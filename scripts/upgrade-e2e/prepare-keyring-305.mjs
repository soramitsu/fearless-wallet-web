#!/usr/bin/env node
// Fetch the historical test oracle without installing or executing the old app.
// Only archives matching the existing 3.0.5 lockfile checksums can be loaded by
// keyring-305.mjs. This does not change the application's dependency graph.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findKeyring305Archives, yarnCacheFolder } from './keyring-305.mjs';

const pinned = JSON.parse(readFileSync(new URL('../../tests/fixtures/upgrade/keyring-3.0.5-packages.json', import.meta.url)));

export function prepareKeyring305Archives({
  cacheFolder = yarnCacheFolder(),
  inspect = findKeyring305Archives,
  run = execFileSync,
} = {}) {
  const before = inspect(cacheFolder);
  if (!before.missing.length) return before;

  const dir = mkdtempSync(path.join(tmpdir(), 'fearless-keyring-fetch-'));
  try {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'fearless-historical-keyring-test-oracle',
      private: true,
      packageManager: 'yarn@3.4.1',
      workspaces: ['packages/*'],
    }));
    // Separate workspaces allow two exact versions of the same package. Npm
    // aliases would change archive paths and therefore the pinned checksums.
    const unique = [...new Map(pinned.packages.map(pkg => [`${pkg.name}@${pkg.version}`, pkg])).values()];
    unique.forEach(({ name, version }, index) => {
      const workspace = path.join(dir, 'packages', String(index));
      mkdirSync(workspace, { recursive: true });
      writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({
        name: `fearless-historical-keyring-package-${index}`, private: true,
        dependencies: { [name]: version },
      }));
    });
    // Use a private config name so a host/project Yarn configuration cannot
    // replace the registry, plugins, compression or pinned Yarn executable.
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('YARN_')));
    Object.assign(env, {
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      YARN_RC_FILENAME: '.fearless-keyring-yarnrc.yml',
      YARN_IGNORE_PATH: '1',
      YARN_CACHE_FOLDER: path.resolve(cacheFolder),
      YARN_ENABLE_GLOBAL_CACHE: 'false',
      YARN_ENABLE_SCRIPTS: 'false',
      YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
      YARN_ENABLE_TELEMETRY: 'false',
      YARN_COMPRESSION_LEVEL: 'mixed',
      YARN_NPM_REGISTRY_SERVER: 'https://registry.npmjs.org',
    });
    run('corepack', ['yarn@3.4.1', 'install', '--mode=skip-build'], {
      cwd: dir, env, stdio: 'inherit', timeout: 300_000,
    });
    const after = inspect(cacheFolder);
    if (after.missing.length) {
      throw new Error(`Historical keyring archives failed pinned checksum verification: ${after.missing.join(', ')}`);
    }
    return after;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { found } = prepareKeyring305Archives();
  console.log(`Verified ${found.length} historical keyring archives against the 3.0.5 lockfile checksums.`);
}
