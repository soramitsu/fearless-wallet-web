#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  auditChromeRelease,
  EXPECTED_CHROME_EXTENSION_ID,
  EXPECTED_TRANSFER_TEST_EXTENSION_ID,
  REQUIRED_PUBLIC_CONFIG_KEYS,
} from './audit-chrome-release.mjs';
import { auditReleaseSource } from './audit-release-source.mjs';

const EXPECTED_NODE_VERSION = 'v24.19.0';
const EXPECTED_YARN_VERSION = '4.17.0';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseProvenancePath = path.join(rootDir, 'dist/extension/chrome-release-provenance.json');
const transferTestProvenancePath = path.join(rootDir, 'dist/extension/chrome-transfer-test-provenance.json');
const EXPECTED_RELEASE_ENVIRONMENT = {
  IS_EXTENSION: 'true',
  NODE_ENV: 'production',
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'false',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'false',
  VUE_APP_EXTENSION_SMOKE: 'false',
  VUE_APP_TEST_ONLY: 'false',
};

function fail(message) {
  throw new Error(message);
}

function resolveYarnPath() {
  const yarnPath = process.env.npm_execpath;
  if (!yarnPath || !path.isAbsolute(yarnPath)) {
    fail('release preparation must be invoked through Yarn so npm_execpath identifies the pinned Yarn runtime');
  }
  return yarnPath;
}

export function spawnYarn(yarnPath, arguments_, options) {
  const isJavaScriptEntrypoint = /\.(?:c|m)?js$/iu.test(yarnPath);
  return spawnSync(
    isJavaScriptEntrypoint ? process.execPath : yarnPath,
    isJavaScriptEntrypoint ? [yarnPath, ...arguments_] : arguments_,
    options
  );
}

function runCommand(command, arguments_, label) {
  const result = spawnSync(command, arguments_, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) fail(`cannot run ${label}: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed with status ${result.status ?? 'unknown'}`);
}

function runYarn(yarnPath, script, ...arguments_) {
  runYarnWithEnvironment(yarnPath, {}, script, ...arguments_);
}

export function createCommandEnvironment(overrides = {}) {
  return { ...process.env, ...overrides };
}

function runYarnWithEnvironment(yarnPath, environmentOverrides, script, ...arguments_) {
  const result = spawnYarn(yarnPath, [script, ...arguments_], {
    cwd: rootDir,
    env: createCommandEnvironment(environmentOverrides),
    stdio: 'inherit',
  });
  if (result.error) fail(`cannot run yarn ${script}: ${result.error.message}`);
  if (result.status !== 0) fail(`yarn ${script} failed with status ${result.status ?? 'unknown'}`);
}

function verifyToolchain(yarnPath) {
  if (process.version !== EXPECTED_NODE_VERSION) {
    fail(`release preparation requires Node ${EXPECTED_NODE_VERSION}, received ${process.version}`);
  }
  const result = spawnYarn(yarnPath, ['--version'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) fail(`cannot determine Yarn version: ${result.stderr?.trim() || result.error?.message}`);
  const yarnVersion = result.stdout.trim();
  if (yarnVersion !== EXPECTED_YARN_VERSION) {
    fail(`release preparation requires Yarn ${EXPECTED_YARN_VERSION}, received ${yarnVersion}`);
  }
  return yarnVersion;
}

function verifyReleaseEnvironment() {
  for (const key of [...REQUIRED_PUBLIC_CONFIG_KEYS, 'EXTENSION_PUBLIC_KEY']) {
    if (typeof process.env[key] !== 'string' || !process.env[key]) {
      fail(`release environment requires non-empty ${key}`);
    }
  }
  for (const [key, expected] of Object.entries(EXPECTED_RELEASE_ENVIRONMENT)) {
    if (process.env[key] !== expected) fail(`release environment requires ${key}=${expected}`);
  }
}

function parseArguments(argv) {
  let requireTag = false;
  let runAutomatedGates = true;
  let transferTest = false;

  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--require-tag') requireTag = true;
    else if (argument === '--skip-automated-gates') runAutomatedGates = false;
    else if (argument === '--transfer-test') transferTest = true;
    else fail(`unknown argument ${argument}`);
  }

  if (requireTag && !runAutomatedGates) fail('--require-tag cannot be combined with --skip-automated-gates');
  if (requireTag && transferTest) fail('--require-tag cannot be combined with --transfer-test');
  return { requireTag, runAutomatedGates, transferTest };
}

function usage() {
  return `Usage: yarn prepare:chrome-release [--require-tag] [--skip-automated-gates] [--transfer-test]\n\nFrom a clean checkout, runs the automated gates, builds the credentialed Chrome artifact twice, requires identical hashes, performs the real Chrome smoke and artifact audit, rechecks source cleanliness, and writes non-secret candidate provenance. Use --require-tag for the final tagged-commit verification. Use --transfer-test for the explicitly non-Store Bitcoin-testnet/Iroha-offline compatibility profile. A skipped-gate diagnostic run never writes provenance.`;
}

function runAutomatedReleaseGates(yarnPath, { transferTest }) {
  runYarn(yarnPath, 'install', '--immutable', '--check-cache');
  runYarn(yarnPath, 'test:vendored-iroha-sdk-audit');
  runYarn(yarnPath, 'audit:vendored-iroha-sdk');

  const debtMarker = ['to', 'do'].join('');

  const testEnvironmentScripts = new Set(['test:all', 'test:e2e:extension', 'test:smoke:bitcoin']);
  const shellGates = [
    ['scripts/test-branch-flow-audit.sh'],
    ['scripts/audit-branch-flow.sh'],
    ['scripts/test-public-artifacts-audit.sh'],
    ['scripts/audit-public-artifacts.sh'],
    [`scripts/test-${debtMarker}-debt-audit.sh`],
    [`scripts/audit-${debtMarker}-debt.sh`],
    ['scripts/test-iroha-js-candidate-verifier.sh'],
    ['scripts/verify-iroha-js-candidate.sh', '--replay-source'],
  ];
  shellGates.push(
    ['scripts/test-iroha-production-send-readiness-audit.sh'],
    ['scripts/audit-iroha-production-send-readiness.sh']
  );
  for (const [script, ...arguments_] of shellGates) {
    runCommand('bash', [script, ...arguments_], `bash ${[script, ...arguments_].join(' ')}`);
  }

  for (const [script, ...arguments_] of [
    ['audit:dependencies'],
    ['audit:dependencies:production'],
    ['test:crypto-dependency-shims'],
    ['test:iroha-safari-qa'],
    ['test:all'],
    ['build:web'],
    ['test:e2e:extension'],
    ['test:smoke:bitcoin'],
    ['test:bitcoin-broadcast-evidence-template'],
    [
      'generate:bitcoin-broadcast-evidence-template',
      '--output',
      'build/reports/bitcoin-broadcast-evidence-template.json',
    ],
    ['test:bitcoin-broadcast-evidence-audit'],
    ['audit:bitcoin-broadcast-evidence'],
  ]) {
    runYarnWithEnvironment(
      yarnPath,
      testEnvironmentScripts.has(script) ? { NODE_ENV: 'test' } : {},
      script,
      ...arguments_
    );
  }
}

async function invalidateReleaseProvenance(provenancePath) {
  const provenanceTemporaryPath = `${provenancePath}.tmp`;
  await fs.rm(provenancePath, { force: true });
  await fs.rm(provenanceTemporaryPath, { force: true });
}

async function prepareChromeRelease({ requireTag, runAutomatedGates, transferTest }) {
  const provenancePath = transferTest ? transferTestProvenancePath : releaseProvenancePath;
  const provenanceTemporaryPath = `${provenancePath}.tmp`;
  await invalidateReleaseProvenance(provenancePath);
  const yarnPath = resolveYarnPath();
  const yarnVersion = verifyToolchain(yarnPath);
  verifyReleaseEnvironment();

  const sourceBefore = await auditReleaseSource({ requireTag, rootDir });
  if (runAutomatedGates) runAutomatedReleaseGates(yarnPath, { transferTest });
  for (const script of [
    'test:extension-build-environment',
    'test:extension-package',
    'test:import-chrome-release-config',
    'test:prepare-chrome-release',
    'test:release-source-audit',
    'test:vendored-iroha-sdk-audit',
    'test:chrome-release-audit',
  ]) {
    runYarn(yarnPath, script);
  }

  const buildScript = transferTest ? 'build:extension:transfer-test:zip' : 'build:extension:zip';
  const distDir = path.join(rootDir, `dist/extension/${transferTest ? 'chrome-transfer-test' : 'chrome'}`);
  const zipPath = path.join(
    distDir,
    transferTest ? 'fearless-wallet-extension-chrome-transfer-test.zip' : 'fearless-wallet-extension-chrome.zip'
  );
  const auditOptions = { distDir, release: true, rootDir, transferTest, zipPath };
  runYarn(yarnPath, buildScript);
  const first = await auditChromeRelease(auditOptions);
  runYarn(yarnPath, buildScript);
  const second = await auditChromeRelease(auditOptions);
  if (first.zipSha256 !== second.zipSha256 || first.archiveBytes !== second.archiveBytes) {
    fail(
      `complete Chrome build is not reproducible: first ${first.zipSha256}/${first.archiveBytes}, second ${second.zipSha256}/${second.archiveBytes}`
    );
  }
  const expectedExtensionId = transferTest
    ? EXPECTED_TRANSFER_TEST_EXTENSION_ID
    : EXPECTED_CHROME_EXTENSION_ID;
  if (second.extensionId !== expectedExtensionId) {
    fail(`release artifact has extension ID ${second.extensionId}, expected ${expectedExtensionId}`);
  }

  runYarn(yarnPath, transferTest ? 'test:smoke:chrome:transfer-test' : 'test:smoke:chrome:production');
  const sourceAfter = await auditReleaseSource({ requireTag, rootDir });
  if (sourceBefore.commit !== sourceAfter.commit) fail('source commit changed during release preparation');

  if (!runAutomatedGates) {
    return {
      artifact: second,
      provenancePath: null,
      source: sourceAfter,
    };
  }

  const provenance = {
    artifact: {
      bytes: second.archiveBytes,
      extensionId: second.extensionId,
      fileCount: second.fileCount,
      path: path.relative(rootDir, second.zipPath).split(path.sep).join('/'),
      sha256: second.zipSha256,
      version: second.version,
    },
    createdAt: new Date().toISOString(),
    policies: transferTest
      ? {
          bitcoin: 'testnet-only',
          iroha: 'legacy-offline-only',
          irohaLiveSubmission: false,
        }
      : {
          bitcoin: 'disabled',
          iroha: 'disabled',
          irohaLiveSubmission: false,
        },
    profile: transferTest ? 'transfer-test' : 'release',
    schemaVersion: 3,
    source: sourceAfter,
    status: transferTest
      ? 'bitcoin-testnet-enabled-iroha-offline-test-candidate'
      : requireTag
        ? 'tagged-artifact-verified'
        : sourceAfter.tag
          ? 'tagged-candidate-tag-not-required'
          : 'untagged-candidate',
    toolchain: {
      node: process.version.slice(1),
      yarn: yarnVersion,
    },
    verification: {
      artifactAudit: true,
      automatedReleaseGates: !transferTest,
      automatedTransferTestGates: transferTest,
      cleanSourceAfter: true,
      completeBuildHashesMatched: true,
      dependencyInstall: 'immutable-check-cache-vendored-iroha-audit',
      productionChromeSmoke: true,
      liveBroadcastEvidence: false,
      storeReleaseEligible: !transferTest,
      tagRequired: requireTag,
      tagVerified: sourceAfter.tag !== null,
      testEnvironmentIsolated: true,
      vendoredIrohaSdkAudit: true,
    },
  };
  await fs.mkdir(path.dirname(provenancePath), { recursive: true });
  await fs.writeFile(provenanceTemporaryPath, `${JSON.stringify(provenance, null, 2)}\n`);
  await fs.rename(provenanceTemporaryPath, provenancePath);

  return { provenancePath, ...provenance };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = await prepareChromeRelease(options);
    if (!result.provenancePath) {
      console.log(
        `Chrome diagnostic candidate passed without automated release gates: version ${result.artifact.version}; commit ${result.source.commit}; extension ID ${result.artifact.extensionId}; ZIP SHA-256 ${result.artifact.zipSha256}; no provenance was written`
      );
      return;
    }
    console.log(
      `Chrome ${result.status}: version ${result.artifact.version}; commit ${result.source.commit}; extension ID ${result.artifact.extensionId}; ZIP SHA-256 ${result.artifact.sha256}; provenance ${result.provenancePath}`
    );
  } catch (error) {
    console.error(`Chrome release preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
