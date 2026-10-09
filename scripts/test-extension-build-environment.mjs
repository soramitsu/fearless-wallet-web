#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  combineSourceProvenance,
  enforceProductionReleaseEnvironment,
  PRODUCTION_RELEASE_FLAGS,
  readSourceProvenance,
} from './build-extension.mjs';

const productionEnvironment = {
  UNRELATED_VALUE: 'preserved',
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'true',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'true',
  VUE_APP_EXTENSION_SMOKE: 'true',
  VUE_APP_TEST_ONLY: 'true',
};
enforceProductionReleaseEnvironment(productionEnvironment, 'production');
assert.deepEqual(
  Object.fromEntries(Object.keys(PRODUCTION_RELEASE_FLAGS).map((key) => [key, productionEnvironment[key]])),
  PRODUCTION_RELEASE_FLAGS
);
assert.equal(productionEnvironment.UNRELATED_VALUE, 'preserved');

const developmentEnvironment = { VUE_APP_TEST_ONLY: 'true' };
enforceProductionReleaseEnvironment(developmentEnvironment, 'development');
assert.equal(developmentEnvironment.VUE_APP_TEST_ONLY, 'true');

const commit = '0123456789abcdef0123456789abcdef01234567';
const clean = { sourceCommit: commit, sourceDirty: false };
assert.deepEqual(combineSourceProvenance(clean, clean), clean);
assert.deepEqual(combineSourceProvenance(clean, { sourceCommit: commit, sourceDirty: true }), {
  sourceCommit: commit,
  sourceDirty: true,
});
assert.deepEqual(combineSourceProvenance(clean, { sourceCommit: 'f'.repeat(40), sourceDirty: false }), {
  sourceCommit: commit,
  sourceDirty: true,
});
assert.deepEqual(combineSourceProvenance(clean, { sourceCommit: null, sourceDirty: null }), {
  sourceCommit: commit,
  sourceDirty: true,
});
assert.deepEqual(combineSourceProvenance({ sourceCommit: null, sourceDirty: null }, clean), {
  sourceCommit: null,
  sourceDirty: null,
});

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-build-provenance-test-'));
try {
  const git = (...args) =>
    execFileSync(
      'git',
      ['-C', temporaryDirectory, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
      { encoding: 'utf8' }
    ).trim();

  assert.deepEqual(readSourceProvenance(temporaryDirectory), { sourceCommit: null, sourceDirty: null });

  await fs.writeFile(path.join(temporaryDirectory, '.gitignore'), '/dist\n');
  await fs.writeFile(path.join(temporaryDirectory, 'yarn.lock'), '__metadata:\n  version: 10\n');
  git('init', '--quiet');
  git('add', '--all');
  git('commit', '--quiet', '--message', 'fixture');
  const head = git('rev-parse', 'HEAD');
  await fs.mkdir(path.join(temporaryDirectory, 'dist'));
  await fs.writeFile(path.join(temporaryDirectory, 'dist/ignored-build-output.js'), 'export {};\n');
  assert.deepEqual(readSourceProvenance(temporaryDirectory), { sourceCommit: head, sourceDirty: false });

  await fs.writeFile(path.join(temporaryDirectory, 'untracked.txt'), 'not reviewed\n');
  assert.deepEqual(readSourceProvenance(temporaryDirectory), { sourceCommit: head, sourceDirty: true });

  const nestedSource = path.join(temporaryDirectory, 'nested-source');
  await fs.mkdir(nestedSource);
  assert.deepEqual(readSourceProvenance(nestedSource), { sourceCommit: null, sourceDirty: null });
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}

console.log('Extension production environment self-test passed (12 checks)');
