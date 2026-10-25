import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareKeyring305Archives } from './upgrade-e2e/prepare-keyring-305.mjs';
import { findKeyring305Archives } from './upgrade-e2e/keyring-305.mjs';

const ready = { found: [{ name: 'verified archive' }], missing: [] };
const missing = { found: [], missing: ['missing or corrupt archive'] };

test('an already verified cache never invokes the package manager', () => {
  assert.equal(prepareKeyring305Archives({ inspect: () => ready, run: () => assert.fail('must not fetch') }), ready);
});

test('fetches exact historical versions in isolation, disables scripts, and verifies the result', () => {
  let dir;
  let inspections = 0;
  const result = prepareKeyring305Archives({
    cacheFolder: '/test/historical-cache',
    inspect: cache => {
      assert.equal(cache, '/test/historical-cache');
      return ++inspections === 1 ? missing : ready;
    },
    run: (command, args, options) => {
      dir = options.cwd;
      assert.equal(command, 'corepack');
      assert.deepEqual(args, ['yarn@3.4.1', 'install', '--mode=skip-build']);
      assert.equal(options.env.YARN_ENABLE_SCRIPTS, 'false');
      assert.equal(options.env.YARN_ENABLE_GLOBAL_CACHE, 'false');
      assert.equal(options.env.YARN_IGNORE_PATH, '1');
      assert.equal(options.env.YARN_CACHE_FOLDER, '/test/historical-cache');
      assert.equal(options.env.YARN_NPM_REGISTRY_SERVER, 'https://registry.npmjs.org');
      assert.equal(options.timeout, 300_000);
      assert.equal(JSON.parse(readFileSync(path.join(dir, 'package.json'))).packageManager, 'yarn@3.4.1');
      const dependencies = readdirSync(path.join(dir, 'packages')).flatMap(name =>
        Object.entries(JSON.parse(readFileSync(path.join(dir, 'packages', name, 'package.json'))).dependencies)
      ).map(([name, version]) => `${name}@${version}`).sort();
      const pinned = JSON.parse(readFileSync(new URL('../tests/fixtures/upgrade/keyring-3.0.5-packages.json', import.meta.url)));
      assert.deepEqual(dependencies, [...new Set(pinned.packages.map(pkg => `${pkg.name}@${pkg.version}`))].sort());
      assert.equal(existsSync(path.join(dir, 'src')), false);
    },
  });
  assert.equal(result, ready);
  assert.equal(inspections, 2);
  assert.equal(existsSync(dir), false);
});

test('refuses fetched archives that still fail the pinned checksum check', () => {
  let dir;
  assert.throws(() => prepareKeyring305Archives({
    inspect: () => missing,
    run: (_command, _args, options) => { dir = options.cwd; },
  }), /failed pinned checksum verification/);
  assert.equal(existsSync(dir), false);
});

test('propagates installer failure and cleans its disposable project', () => {
  let dir;
  assert.throws(() => prepareKeyring305Archives({
    inspect: () => missing,
    run: (_command, _args, options) => { dir = options.cwd; throw new Error('fetch failed'); },
  }), /fetch failed/);
  assert.equal(existsSync(dir), false);
});

test('neither global nor checksum-style filenames can make unverified bytes trusted', () => {
  const cache = mkdtempSync(path.join(tmpdir(), 'fearless-corrupt-keyring-cache-'));
  try {
    for (const suffix of ['8', '74f615b583']) {
      writeFileSync(path.join(cache, `@subwallet-keyring-npm-0.1.7-c6cd451d2d-${suffix}.zip`), 'corrupt archive');
    }
    const result = findKeyring305Archives(cache);
    assert.equal(result.found.length, 0);
    assert.ok(result.missing.includes('@subwallet/keyring@0.1.7'));
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});
