#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditIrohaSendReadiness } from './audit-iroha-send-readiness.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = 'config/iroha-production-send-readiness.json';
const copiedFiles = [
  manifestPath,
  'src/consts/universalWallet.ts',
  'src/extension/background/extension-base/src/api/iroha/productionTransferCodec.ts',
  'src/util/irohaSdkBrowserBinding.ts',
  'vendor/iroha-js/iroha-iroha-js-0.0.3.tgz',
  'vite.config.shared.mjs',
];
const HASH = `${'ab'.repeat(31)}a1`;
let checks = 0;

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function createFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-iroha-readiness-'));

  for (const file of copiedFiles) {
    await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await fs.copyFile(path.join(rootDir, file), path.join(directory, file));
  }
  await fs.writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify({ dependencies: { '@iroha/iroha-js': 'file:vendor/iroha-js/iroha-iroha-js-0.0.3.tgz' } })}\n`
  );
  // Fixtures start blocked whatever the checked-in release state; its evidence commits are not in this repository.
  await editJson(directory, manifestPath, blockedManifest);
  git(directory, 'init', '-q');
  git(directory, 'add', '.');
  git(directory, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture');

  return { commit: git(directory, 'rev-parse', 'HEAD'), directory };
}

async function editJson(directory, file, mutate) {
  const target = path.join(directory, file);
  const value = JSON.parse(await fs.readFile(target, 'utf8'));

  mutate(value);
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function editText(directory, file, mutate) {
  const target = path.join(directory, file);

  await fs.writeFile(target, mutate(await fs.readFile(target, 'utf8')));
}

function blockedManifest(manifest) {
  manifest.status = 'blocked';
  manifest.releaseEnabled = false;
  manifest.blockers = ['taira-transfer-evidence-missing'];
  manifest.networks.taira.releaseEnabled = false;
  manifest.evidence = [];
}

function readyManifest(commit, overrides = {}) {
  return (manifest) => {
    manifest.status = 'ready';
    manifest.releaseEnabled = true;
    manifest.blockers = [];
    manifest.networks.taira.releaseEnabled = true;
    manifest.evidence = [
      {
        amount: '0.75',
        assetDefinitionId: manifest.networks.taira.feeAssetDefinitionId,
        blockHeight: 56,
        commit,
        fee: '0.01',
        network: 'taira',
        networkId: manifest.networks.taira.networkId,
        operator: 'fixture',
        recipient: 'testuRecipient',
        recordedAt: new Date(Date.UTC(2026, 9, 22, 13, 43, 55)).toISOString(),
        source: 'testuSource',
        transactionHash: HASH,
        ...overrides,
      },
    ];
  };
}

const NOW = Date.UTC(2026, 9, 23);

async function expectPass(root, options = {}) {
  await auditIrohaSendReadiness({ now: NOW, root, ...options });
  checks += 1;
}

async function expectFail(root, pattern, options = {}) {
  await assert.rejects(auditIrohaSendReadiness({ now: NOW, root, ...options }), pattern);
  checks += 1;
}

function liveFetch({ genesis, kind = 'Applied', resolvedFrom = 'state', schema = '7ab5ff9c572efb316deac478f19209c5' } = {}) {
  return async (url) => {
    const { pathname } = new URL(url);
    const body =
      pathname === '/v1/explorer/blocks/1'
        ? { hash: genesis, height: 1, prev_block_hash: null }
        : pathname === '/v1/node/capabilities'
          ? { data_model_version: 4, signed_transaction_schema_hash_hex: schema }
          : { hash: HASH, resolved_from: resolvedFrom, scope: 'global', status: { kind } };

    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status: 200 });
  };
}

const fixtures = [];

try {
  // The checked-in manifest passes as it stands, judged at the current time rather than the fixture date.
  await expectPass(rootDir, { now: Date.now() });

  const blocked = await createFixture();
  fixtures.push(blocked.directory);
  await expectPass(blocked.directory);
  await expectFail(blocked.directory, /is not ready/u, { requireReady: true });

  const ready = await createFixture();
  fixtures.push(ready.directory);
  await editJson(ready.directory, manifestPath, readyManifest(ready.commit));
  await expectPass(ready.directory, { requireReady: true });

  const manifest = JSON.parse(await fs.readFile(path.join(ready.directory, manifestPath), 'utf8'));
  const { networkId } = manifest.networks.taira;

  await expectPass(ready.directory, { fetchFn: liveFetch({ genesis: networkId }), live: true });
  await expectFail(ready.directory, /Taira was reset/u, {
    fetchFn: liveFetch({ genesis: 'hash:0000000000000000000000000000000000000000000000000000000000000001#2E2B' }),
    live: true,
  });
  await expectFail(ready.directory, /wire format/u, { fetchFn: liveFetch({ genesis: networkId, schema: '00'.repeat(16) }), live: true });
  await expectFail(ready.directory, /not state-resolved Applied/u, {
    fetchFn: liveFetch({ genesis: networkId, kind: 'Rejected' }),
    live: true,
  });
  await expectFail(ready.directory, /not state-resolved Applied/u, {
    fetchFn: liveFetch({ genesis: networkId, resolvedFrom: 'cache' }),
    live: true,
  });
  await expectFail(ready.directory, /older than 30 days/u, { now: NOW + 40 * 24 * 60 * 60 * 1000 });

  const cases = [
    ['a blocked manifest that claims release', (dir) => editJson(dir, manifestPath, (m) => (m.releaseEnabled = true)), /exactly when status is ready/u],
    ['ready without evidence', (dir) => editJson(dir, manifestPath, (m) => { readyManifest(blocked.commit)(m); m.evidence = []; }), /requires live transfer evidence/u],
    ['a tampered SDK archive', async (dir) => {
      const archive = path.join(dir, 'vendor/iroha-js/iroha-iroha-js-0.0.3.tgz');
      const bytes = await fs.readFile(archive);
      bytes[64] ^= 1;
      await fs.writeFile(archive, bytes);
    }, /SHA-256/u],
    ['a foreign SDK dependency', (dir) => editJson(dir, 'package.json', (p) => (p.dependencies['@iroha/iroha-js'] = '0.0.3')), /must depend on @iroha\/iroha-js/u],
    ['a different pinned Taira genesis', (dir) => editText(dir, 'src/consts/universalWallet.ts', (t) => t.replace(/networkId: 'hash:[^']+'/u, "networkId: 'hash:0000000000000000000000000000000000000000000000000000000000000001#2E2B'")), /pin the manifest Taira networkId/u],
    ['a different wire schema', (dir) => editText(dir, 'src/consts/universalWallet.ts', (t) => t.replace('7ab5ff9c572efb316deac478f19209c5', '00'.repeat(16))), /schema hash/u],
    ['Nexus enabled by default', (dir) => editText(dir, 'src/consts/universalWallet.ts', (t) => t.replace(/(nexus: \{[^}]*enabledByDefault: )false/su, '$1true')), /Nexus must stay disabled/u],
    ['Nexus sends enabled in the manifest', (dir) => editJson(dir, manifestPath, (m) => (m.networks.nexus.releaseEnabled = true)), /Nexus sends must stay disabled/u],
    ['an MCP call in wallet source', (dir) => fs.writeFile(path.join(dir, 'src/util/mcp.ts'), "export const url = 'https://taira.sora.org/v1/mcp';\n"), /calls Torii MCP/u],
    ['the global native-binding seam', (dir) => fs.writeFile(path.join(dir, 'src/util/seam.ts'), 'export const seam = globalThis.__IROHA_NATIVE_BINDING__;\n'), /native-binding seam/u],
    ['a codec outside the vendored SDK', (dir) => editText(dir, 'src/extension/background/extension-base/src/api/iroha/productionTransferCodec.ts', (t) => t.replace("from '@iroha/iroha-js/transaction-codec'", "from './localCodec'")), /vendored @iroha\/iroha-js\/transaction-codec/u],
    ['a missing SDK native redirect', (dir) => editText(dir, 'vite.config.shared.mjs', (t) => t.replaceAll('fearless-iroha-sdk-browser-binding', 'other-plugin')), /route the SDK native import/u],
  ];

  for (const [label, mutate, pattern] of cases) {
    const fixture = await createFixture();
    fixtures.push(fixture.directory);
    await mutate(fixture.directory);
    await expectFail(fixture.directory, pattern).catch((error) => {
      throw new Error(`${label}: ${error.message}`);
    });
  }

  const evidenceCases = [
    ['evidence from another Taira genesis', { networkId: 'hash:0000000000000000000000000000000000000000000000000000000000000001#2E2B' }, /another Taira genesis/u],
    ['a noncanonical transaction hash', { transactionHash: `${'ab'.repeat(31)}a0` }, /transactionHash is missing or malformed/u],
    ['a self-transfer', { recipient: 'testuSource' }, /distinct accounts/u],
    ['an unknown commit', { commit: '0'.repeat(40) }, /not an ancestor of HEAD/u],
    ['a future timestamp', { recordedAt: new Date(NOW + 60 * 60 * 1000).toISOString() }, /older than 30 days or in the future/u],
  ];

  for (const [label, overrides, pattern] of evidenceCases) {
    const fixture = await createFixture();
    fixtures.push(fixture.directory);
    await editJson(fixture.directory, manifestPath, readyManifest(fixture.commit, overrides));
    await expectFail(fixture.directory, pattern).catch((error) => {
      throw new Error(`${label}: ${error.message}`);
    });
  }

  // Evidence recorded before a transfer-path change no longer describes the released code.
  const stale = await createFixture();
  fixtures.push(stale.directory);
  await editJson(stale.directory, manifestPath, readyManifest(stale.commit));
  await editText(stale.directory, 'src/util/irohaSdkBrowserBinding.ts', (t) => `${t}\n// changed\n`);
  git(stale.directory, 'add', '.');
  git(stale.directory, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'change');
  await expectFail(stale.directory, /record fresh evidence/u);

  console.log(`Iroha send readiness audit self-test passed (${checks} checks)`);
} finally {
  await Promise.all(fixtures.map((directory) => fs.rm(directory, { force: true, recursive: true })));
}
