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
  pinBuildNodeEnv,
  PRODUCTION_RELEASE_FLAGS,
  readSourceProvenance,
} from './build-extension.mjs';
import { readReleaseTransferFlags } from './release-transfer-flags.mjs';
import { fileURLToPath } from 'node:url';
import { commonViteConfig, resolveBuildNodeEnv } from '../vite.config.shared.mjs';

const productionEnvironment = {
  UNRELATED_VALUE: 'preserved',
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'false',
  VUE_APP_ENABLE_IROHA_CONNECT: 'true',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'true',
  VUE_APP_ENABLE_SOLANA_TRANSFERS: 'false',
  VUE_APP_EXTENSION_SMOKE: 'true',
  VUE_APP_PORTFOLIO_DASHBOARD: 'false',
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

// A credentialed Chrome build must not accidentally enable Firefox Google backup.
for (const target of ['chrome', 'firefox']) {
  const environment = { EXTENSION_TYPE: target, OAUTH_CLIENT_ID: 'chrome-client.apps.googleusercontent.com' };
  enforceProductionReleaseEnvironment(environment, 'production');
  assert.equal(environment.OAUTH_CLIENT_ID, target === 'chrome' ? 'chrome-client.apps.googleusercontent.com' : '');
}
const explicitFirefox = { EXTENSION_TYPE: 'chrome', OAUTH_CLIENT_ID: 'inherited-client' };
enforceProductionReleaseEnvironment(explicitFirefox, 'production', 'firefox');
assert.equal(explicitFirefox.OAUTH_CLIENT_ID, '');
const developmentFirefox = { EXTENSION_TYPE: 'firefox', OAUTH_CLIENT_ID: 'development-fixture' };
enforceProductionReleaseEnvironment(developmentFirefox, 'development', 'firefox');
assert.equal(developmentFirefox.OAUTH_CLIENT_ID, 'development-fixture');

// Bitcoin and Solana sends ship enabled; IrohaConnect stays compiled off.
assert.equal(PRODUCTION_RELEASE_FLAGS.VUE_APP_ENABLE_BITCOIN_TRANSFERS, 'true');
assert.equal(PRODUCTION_RELEASE_FLAGS.VUE_APP_ENABLE_SOLANA_TRANSFERS, 'true');
assert.equal(PRODUCTION_RELEASE_FLAGS.VUE_APP_ENABLE_IROHA_CONNECT, 'false');
assert.equal(PRODUCTION_RELEASE_FLAGS.VUE_APP_ENABLE_IROHA_TRANSFERS,
  readReleaseTransferFlags(fileURLToPath(new URL('..', import.meta.url))).VUE_APP_ENABLE_IROHA_TRANSFERS);
// The portfolio dashboard ships; a release cannot leave it out by its environment.
assert.equal(PRODUCTION_RELEASE_FLAGS.VUE_APP_PORTFOLIO_DASHBOARD, 'true');

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
withEnvironment(
  {
    VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'true',
    VUE_APP_ENABLE_IROHA_CONNECT: 'false',
    VUE_APP_ENABLE_IROHA_TRANSFERS: 'false',
    VUE_APP_ENABLE_SOLANA_TRANSFERS: 'true',
  },
  () => {
    const config = commonViteConfig(viteOptions('production'));
    assert.equal(config.define['process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS'], JSON.stringify('true'));
    assert.equal(config.define['process.env.VUE_APP_ENABLE_SOLANA_TRANSFERS'], JSON.stringify('true'));
    assert.equal(config.define['process.env.VUE_APP_ENABLE_IROHA_CONNECT'], JSON.stringify('false'));
  }
);

// One NODE_ENV for every bundle of a build (B35). It picks the chain list, the feature config and SORA's ids
// (IS_PRODUCTION), so a release is production throughout and a test build is test throughout.
const withVariables = (overrides, run) => {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  const assign = (values) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  assign(overrides);
  try {
    return run();
  } finally {
    assign(previous);
  }
};
const compiledNodeEnv = (mode) => JSON.parse(commonViteConfig(viteOptions(mode)).define['process.env.NODE_ENV']);
const buildCases = [
  // [build, --mode, environment before the build, NODE_ENV of every bundle]
  ['yarn build:extension without NODE_ENV', 'production', {}, 'production'],
  ['a release build with a stray NODE_ENV', 'production', { NODE_ENV: 'development' }, 'production'],
  ['prepare:chrome-release', 'production', { NODE_ENV: 'production' }, 'production'],
  ['yarn build:extension-test', 'development', { VUE_APP_TEST_ONLY: 'true' }, 'test'],
  ['test:e2e:extension in prepare:chrome-release', 'development', { NODE_ENV: 'test', VUE_APP_TEST_ONLY: 'true' }, 'test'],
  ['the dashboard smoke build', 'development', { NODE_ENV: 'production', VUE_APP_TEST_ONLY: 'true' }, 'production'],
  ['yarn build-watch:extension', 'development', {}, 'development'],
];
for (const [build, mode, environment, expected] of buildCases) {
  withVariables({ NODE_ENV: undefined, VUE_APP_TEST_ONLY: undefined, ...environment }, () => {
    assert.equal(resolveBuildNodeEnv(mode, process.env), expected, build);
    // build-extension.mjs: pin, then build the popup first and the worker and content scripts after it.
    assert.equal(pinBuildNodeEnv(process.env, mode), expected, build);
    const popup = compiledNodeEnv(mode);
    // Vite gives an unset NODE_ENV the value `production` while it builds; a pinned one is kept.
    process.env.NODE_ENV ||= 'production';
    const worker = compiledNodeEnv(mode);
    assert.deepEqual({ popup, worker }, { popup: expected, worker: expected }, build);
  });
}
// Without the pin, a release's bundles still agree: production is decided by the mode, never by the shell.
withVariables({ NODE_ENV: undefined }, () => {
  const popup = compiledNodeEnv('production');
  process.env.NODE_ENV = 'production';
  assert.deepEqual({ popup, worker: compiledNodeEnv('production') }, { popup: 'production', worker: 'production' });
});
assert.equal(resolveBuildNodeEnv('test', {}), 'test');
// Vue picks its development or production template compiler from NODE_ENV once, when it is first loaded. Importing the
// build script loads neither Vue nor Vite, so its pin comes first, and Vue loaded after the pin is the production build.
{
  const scriptsDirectory = fileURLToPath(new URL('.', import.meta.url));
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_ENV;
  const child = `import path from 'node:path';
import { createRequire } from 'node:module';
const buildScript = await import(${JSON.stringify(path.join(scriptsDirectory, 'build-extension.mjs'))});
if (process.argv[1] === 'pin') {
  buildScript.pinBuildNodeEnv(process.env, 'production');
  await buildScript.loadBuildToolchain();
}
const loaded = Object.keys(createRequire(${JSON.stringify(path.join(scriptsDirectory, '..', 'package.json'))}).cache);
console.log(JSON.stringify(loaded.filter((file) => file.includes(path.join('@vue', 'compiler-core', 'dist'))).map((file) => path.basename(file))));`;
  const loadedCompiler = (step) =>
    JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', child, step], { encoding: 'utf8', env: childEnvironment }));

  assert.deepEqual(loadedCompiler('import'), []);
  assert.deepEqual(loadedCompiler('pin'), ['compiler-core.cjs.prod.js']);
}

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

console.log('Extension production environment self-test passed (57 checks)');
