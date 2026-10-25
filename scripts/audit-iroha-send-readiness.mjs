#!/usr/bin/env node

// Release gate for Iroha (Taira) sends in the browser extension.
//
// Offline it checks the readiness manifest against the vendored SDK, the pinned network and wire
// constants, the direct-Torii transport and the recorded evidence. A manifest may only claim
// `ready` with live transfer evidence produced by an ancestor commit whose transfer-path files are
// unchanged. `--live` additionally confirms on Taira that the genesis still matches and every
// evidence transaction is state-resolved Applied.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = 'config/iroha-production-send-readiness.json';
const CONSTANTS_PATH = 'src/consts/universalWallet.ts';
const CODEC_PATH = 'src/extension/background/extension-base/src/api/iroha/productionTransferCodec.ts';
const VITE_CONFIG_PATH = 'vite.config.shared.mjs';
const NETWORK_ID = /^hash:[0-9A-F]{63}[13579BDF]#[0-9A-F]{4}$/u;
const TRANSACTION_HASH = /^[0-9a-f]{63}[13579bdf]$/u;
const QUANTITY = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_TIMEOUT_MS = 20_000;

class ReadinessError extends Error {}

function fail(message) {
  throw new ReadinessError(message);
}

function requireRecord(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);

  return value;
}

function requireString(value, label, pattern) {
  if (typeof value !== 'string' || !value || value !== value.trim() || (pattern && !pattern.test(value))) {
    fail(`${label} is missing or malformed`);
  }

  return value;
}

async function readText(root, relativePath) {
  try {
    return await fs.readFile(path.join(root, relativePath), 'utf8');
  } catch {
    fail(`${relativePath} is missing`);
  }
}

async function listSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) files.push(...(await listSourceFiles(fullPath)));
    else if (/\.(?:ts|vue|js|mjs)$/u.test(entry.name)) files.push(fullPath);
  }

  return files;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function validateManifestShape(manifest) {
  requireRecord(manifest, 'manifest');
  if (manifest.schemaVersion !== 2) fail('manifest schemaVersion must be 2');
  if (manifest.platform !== 'browser-extension') fail('manifest platform must be browser-extension');
  if (manifest.status !== 'blocked' && manifest.status !== 'ready') fail('manifest status must be blocked or ready');
  if (typeof manifest.releaseEnabled !== 'boolean') fail('manifest releaseEnabled must be a boolean');
  if (manifest.releaseEnabled !== (manifest.status === 'ready')) {
    fail('manifest releaseEnabled must be true exactly when status is ready');
  }
  if (manifest.transport !== 'torii-rest') fail('manifest transport must be torii-rest');

  const networks = requireRecord(manifest.networks, 'networks');
  const taira = requireRecord(networks.taira, 'networks.taira');
  const nexus = requireRecord(networks.nexus, 'networks.nexus');

  if (taira.releaseEnabled !== manifest.releaseEnabled) fail('networks.taira.releaseEnabled must match releaseEnabled');
  requireString(taira.toriiBaseUrl, 'networks.taira.toriiBaseUrl', /^https:\/\/[^/?#\s]+$/u);
  requireString(taira.networkId, 'networks.taira.networkId', NETWORK_ID);
  if (taira.networkPrefix !== 369) fail('networks.taira.networkPrefix must be 369');
  requireString(taira.feeAssetDefinitionId, 'networks.taira.feeAssetDefinitionId', /^[1-9A-HJ-NP-Za-km-z]{20,64}$/u);
  if (nexus.releaseEnabled !== false || nexus.enabledByDefault !== false) {
    fail('SORA Nexus sends must stay disabled until it has an approved endpoint and pinned network identity');
  }

  const artifact = requireRecord(manifest.artifact, 'artifact');

  requireString(artifact.path, 'artifact.path', /^vendor\/iroha-js\/[A-Za-z0-9._-]+\.tgz$/u);
  requireString(artifact.sha256, 'artifact.sha256', /^[0-9a-f]{64}$/u);
  requireString(artifact.sourceCommit, 'artifact.sourceCommit', COMMIT);
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0) fail('artifact.bytes must be a positive integer');

  const wire = requireRecord(manifest.wire, 'wire');

  if (!Number.isSafeInteger(wire.dataModelVersion) || wire.dataModelVersion <= 0) fail('wire.dataModelVersion is malformed');
  requireString(wire.signedTransactionSchemaHash, 'wire.signedTransactionSchemaHash', /^[0-9a-f]{32}$/u);

  const policy = requireRecord(manifest.evidencePolicy, 'evidencePolicy');

  if (!Number.isSafeInteger(policy.maxAgeDays) || policy.maxAgeDays < 1 || policy.maxAgeDays > 90) {
    fail('evidencePolicy.maxAgeDays must be between 1 and 90');
  }
  if (!Array.isArray(policy.transferPathFiles) || policy.transferPathFiles.length === 0) {
    fail('evidencePolicy.transferPathFiles must list the transfer path');
  }
  if (!Array.isArray(manifest.evidence)) fail('manifest evidence must be an array');
  if (manifest.status === 'ready' && manifest.evidence.length === 0) fail('a ready manifest requires live transfer evidence');
  if (manifest.status === 'blocked' && manifest.evidence.length > 0 && manifest.releaseEnabled) {
    fail('blocked manifests cannot be release-enabled');
  }
}

async function auditArtifact(root, manifest) {
  const { artifact } = manifest;
  let bytes;

  try {
    bytes = await fs.readFile(path.join(root, artifact.path));
  } catch {
    fail(`${artifact.path} is missing`);
  }
  if (bytes.length !== artifact.bytes) fail(`${artifact.path} has ${bytes.length} bytes, expected ${artifact.bytes}`);

  const digest = createHash('sha256').update(bytes).digest('hex');

  if (digest !== artifact.sha256) fail(`${artifact.path} SHA-256 is ${digest}, expected ${artifact.sha256}`);

  const rootPackage = JSON.parse(await readText(root, 'package.json'));

  if (rootPackage.dependencies?.['@iroha/iroha-js'] !== `file:${artifact.path}`) {
    fail(`package.json must depend on @iroha/iroha-js through file:${artifact.path}`);
  }
}

async function auditSource(root, manifest) {
  const constants = await readText(root, CONSTANTS_PATH);
  const codec = await readText(root, CODEC_PATH);
  const viteConfig = await readText(root, VITE_CONFIG_PATH);
  const { taira } = manifest.networks;

  if (!constants.includes(`networkId: '${taira.networkId}'`)) fail(`${CONSTANTS_PATH} must pin the manifest Taira networkId`);
  if (!constants.includes(`toriiBaseUrl: '${taira.toriiBaseUrl}'`)) fail(`${CONSTANTS_PATH} must use the manifest Taira Torii`);
  if (!constants.includes(`dataModelVersion: ${manifest.wire.dataModelVersion},`)) {
    fail(`${CONSTANTS_PATH} must pin the manifest data model version`);
  }
  if (!constants.includes(`signedTransactionSchemaHash: '${manifest.wire.signedTransactionSchemaHash}'`)) {
    fail(`${CONSTANTS_PATH} must pin the manifest signed-transaction schema hash`);
  }
  if (!/nexus: \{[^}]*enabledByDefault: false,/su.test(constants)) fail('SORA Nexus must stay disabled by default');
  if (!codec.includes("from '@iroha/iroha-js/transaction-codec'")) {
    fail(`${CODEC_PATH} must use the vendored @iroha/iroha-js/transaction-codec`);
  }
  if (!viteConfig.includes('fearless-iroha-sdk-browser-binding') || !viteConfig.includes(manifest.artifact.browserAddressBinding)) {
    fail(`${VITE_CONFIG_PATH} must route the SDK native import to ${manifest.artifact.browserAddressBinding}`);
  }
  await readText(root, manifest.artifact.browserAddressBinding);

  for (const file of await listSourceFiles(path.join(root, 'src'))) {
    const text = await fs.readFile(file, 'utf8');
    const relative = path.relative(root, file);

    if (text.includes('/v1/mcp') || text.includes("'tools/call'")) fail(`${relative} calls Torii MCP; the wallet must use Torii REST`);
    if (text.includes('__IROHA_NATIVE_BINDING__')) fail(`${relative} reintroduces the global native-binding seam`);
  }
}

function auditEvidenceEntries(root, manifest, now) {
  const { taira } = manifest.networks;
  const maxAgeMs = manifest.evidencePolicy.maxAgeDays * DAY_MS;
  const seen = new Set();

  for (const [index, entry] of manifest.evidence.entries()) {
    const label = `evidence[${index}]`;

    requireRecord(entry, label);
    if (entry.network !== 'taira') fail(`${label}.network must be taira`);
    if (entry.networkId !== taira.networkId) fail(`${label} was recorded on another Taira genesis; record fresh evidence`);
    requireString(entry.transactionHash, `${label}.transactionHash`, TRANSACTION_HASH);
    if (seen.has(entry.transactionHash)) fail(`${label}.transactionHash is duplicated`);
    seen.add(entry.transactionHash);
    if (!Number.isSafeInteger(entry.blockHeight) || entry.blockHeight < 1) fail(`${label}.blockHeight is malformed`);
    requireString(entry.amount, `${label}.amount`, QUANTITY);
    requireString(entry.fee, `${label}.fee`, QUANTITY);
    if (entry.assetDefinitionId !== taira.feeAssetDefinitionId) fail(`${label}.assetDefinitionId must be Taira XOR`);
    requireString(entry.source, `${label}.source`, /^testu\S+$/u);
    requireString(entry.recipient, `${label}.recipient`, /^testu\S+$/u);
    if (entry.source === entry.recipient) fail(`${label} must transfer between distinct accounts`);
    requireString(entry.commit, `${label}.commit`, COMMIT);
    requireString(entry.operator, `${label}.operator`);

    const recordedAt = Date.parse(requireString(entry.recordedAt, `${label}.recordedAt`));

    if (!Number.isFinite(recordedAt) || new Date(recordedAt).toISOString() !== entry.recordedAt) {
      fail(`${label}.recordedAt must be an exact UTC ISO timestamp`);
    }
    if (recordedAt > now + 5 * 60 * 1000 || now - recordedAt > maxAgeMs) {
      fail(`${label} is older than ${manifest.evidencePolicy.maxAgeDays} days or in the future`);
    }

    // The evidence must come from the code being released.
    try {
      git(root, ['merge-base', '--is-ancestor', entry.commit, 'HEAD']);
    } catch {
      fail(`${label}.commit is not an ancestor of HEAD`);
    }
    const changed = git(root, ['diff', '--name-only', entry.commit, 'HEAD', '--', ...manifest.evidencePolicy.transferPathFiles]);

    if (changed) fail(`${label} predates transfer-path changes (${changed.split('\n').join(', ')}); record fresh evidence`);
  }
}

async function getJson(fetchFn, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);

  try {
    const response = await fetchFn(url, {
      credentials: 'omit',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    const text = await response.text();

    return { body: text ? JSON.parse(text) : null, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function auditLive(manifest, fetchFn) {
  const { taira } = manifest.networks;
  const genesis = await getJson(fetchFn, `${taira.toriiBaseUrl}/v1/explorer/blocks/1`);

  if (genesis.status !== 200 || genesis.body?.hash !== taira.networkId) {
    fail(`Taira genesis is ${genesis.body?.hash ?? `HTTP ${genesis.status}`}, expected ${taira.networkId}; Taira was reset`);
  }

  const capabilities = await getJson(fetchFn, `${taira.toriiBaseUrl}/v1/node/capabilities`);

  if (
    capabilities.body?.data_model_version !== manifest.wire.dataModelVersion ||
    capabilities.body?.signed_transaction_schema_hash_hex !== manifest.wire.signedTransactionSchemaHash
  ) {
    fail('Taira no longer reports the wire format the vendored codec encodes');
  }

  for (const entry of manifest.evidence) {
    const status = await getJson(
      fetchFn,
      `${taira.toriiBaseUrl}/v1/pipeline/transactions/status?hash=${entry.transactionHash}&scope=global`
    );

    if (status.status !== 200 || status.body?.resolved_from !== 'state' || status.body?.status?.kind !== 'Applied') {
      fail(`evidence transaction ${entry.transactionHash} is not state-resolved Applied on Taira`);
    }
  }
}

export async function auditIrohaSendReadiness({
  fetchFn = globalThis.fetch,
  live = false,
  now = Date.now(),
  requireReady = false,
  root = ROOT_DIR,
} = {}) {
  let manifest;

  try {
    manifest = JSON.parse(await readText(root, MANIFEST_PATH));
  } catch (error) {
    if (error instanceof ReadinessError) throw error;
    fail(`${MANIFEST_PATH} is not valid JSON`);
  }

  validateManifestShape(manifest);
  if (requireReady && manifest.status !== 'ready') fail(`${MANIFEST_PATH} is not ready: ${(manifest.blockers ?? []).join(', ')}`);
  await auditArtifact(root, manifest);
  await auditSource(root, manifest);
  auditEvidenceEntries(root, manifest, now);
  if (live) await auditLive(manifest, fetchFn);

  return {
    evidence: manifest.evidence.length,
    live,
    releaseEnabled: manifest.releaseEnabled,
    status: manifest.status,
  };
}

async function main(argv) {
  const options = { live: false, requireReady: false };

  for (const argument of argv) {
    if (argument === '--live') options.live = true;
    else if (argument === '--require-ready') options.requireReady = true;
    else {
      console.error(`[iroha-send-readiness][error] unknown argument ${argument}`);
      process.exit(2);
    }
  }

  try {
    const result = await auditIrohaSendReadiness(options);

    console.log(
      `[iroha-send-readiness] ok: status=${result.status} releaseEnabled=${result.releaseEnabled} evidence=${result.evidence}${result.live ? ' live=verified' : ''}`
    );
  } catch (error) {
    console.error(`[iroha-send-readiness][error] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
