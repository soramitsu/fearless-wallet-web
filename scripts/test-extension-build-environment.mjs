#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  combineSourceProvenance,
  createExtensionBuildMetadata,
  enforceProductionReleaseEnvironment,
  PRODUCTION_RELEASE_FLAGS,
  readSourceProvenance,
} from './build-extension.mjs';
import { commonViteConfig } from '../vite.config.shared.mjs';

const productionEnvironment = {
  UNRELATED_VALUE: 'preserved',
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'true',
  VUE_APP_ENABLE_IROHA_CONNECT: 'true',
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

// IrohaConnect stays compiled off in production builds.
assert.equal(PRODUCTION_RELEASE_FLAGS.VUE_APP_ENABLE_IROHA_CONNECT, 'false');

const withEnvironment = (overrides, run) => {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};
const viteOptions = (mode) => ({ mode, outDir: path.join(os.tmpdir(), 'fearless-vite-guard-test'), publicDir: false });
withEnvironment({ VUE_APP_ENABLE_IROHA_CONNECT: 'true', VUE_APP_ENABLE_IROHA_TRANSFERS: 'false' }, () => {
  assert.throws(() => commonViteConfig(viteOptions('production')), /iroha_connect_blind_signing_unreviewed/u);
  assert.doesNotThrow(() => commonViteConfig(viteOptions('development')));
});

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

const serializedBuildMetadata = async (browser, sourceRoot) =>
  `${JSON.stringify(
    await createExtensionBuildMetadata({
      browser,
      mode: 'production',
      environment: PRODUCTION_RELEASE_FLAGS,
      sourceRoot,
      sourceBefore: readSourceProvenance(sourceRoot),
    }),
    null,
    2
  )}\n`;

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-build-provenance-test-'));
const sourceArchiveDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-build-source-archive-test-'));
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

  // An AMO source-code submission is a `git archive` of the release commit, so
  // the reviewer's rebuild has no Git metadata to read.
  execFileSync('tar', ['-x', '-C', sourceArchiveDirectory], {
    input: execFileSync('git', ['-C', temporaryDirectory, 'archive', '--format=tar', 'HEAD']),
  });
  assert.deepEqual(readSourceProvenance(sourceArchiveDirectory), { sourceCommit: null, sourceDirty: null });

  const firefoxCheckoutMetadata = await serializedBuildMetadata('firefox', temporaryDirectory);
  assert.equal(await serializedBuildMetadata('firefox', sourceArchiveDirectory), firefoxCheckoutMetadata);
  assert.deepEqual(Object.keys(JSON.parse(firefoxCheckoutMetadata)), [
    'browser',
    'mode',
    'releaseFlags',
    'schemaVersion',
    'yarnLockSha256',
  ]);

  const chromeCheckoutMetadata = JSON.parse(await serializedBuildMetadata('chrome', temporaryDirectory));
  assert.deepEqual(
    { sourceCommit: chromeCheckoutMetadata.sourceCommit, sourceDirty: chromeCheckoutMetadata.sourceDirty },
    { sourceCommit: head, sourceDirty: false }
  );
  const chromeArchiveMetadata = JSON.parse(await serializedBuildMetadata('chrome', sourceArchiveDirectory));
  assert.deepEqual(
    { sourceCommit: chromeArchiveMetadata.sourceCommit, sourceDirty: chromeArchiveMetadata.sourceDirty },
    { sourceCommit: null, sourceDirty: null }
  );

  await fs.writeFile(path.join(temporaryDirectory, 'untracked.txt'), 'not reviewed\n');
  assert.deepEqual(readSourceProvenance(temporaryDirectory), { sourceCommit: head, sourceDirty: true });
  assert.equal(await serializedBuildMetadata('firefox', temporaryDirectory), firefoxCheckoutMetadata);

  const nestedSource = path.join(temporaryDirectory, 'nested-source');
  await fs.mkdir(nestedSource);
  assert.deepEqual(readSourceProvenance(nestedSource), { sourceCommit: null, sourceDirty: null });
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
  await fs.rm(sourceArchiveDirectory, { recursive: true, force: true });
}

console.log('Extension production environment self-test passed (21 checks)');
