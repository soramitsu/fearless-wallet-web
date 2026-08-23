// Copyright 2026 Soramitsu Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  SAFARI_QA_ASSERTION_INVENTORY_SHA256,
  SAFARI_QA_BUNDLE_BYTES,
  SAFARI_QA_BUNDLE_INPUTS,
  SAFARI_QA_BUNDLE_SHA256,
  SAFARI_QA_CANDIDATE_PACKAGE_INPUTS,
  SAFARI_QA_ESBUILD_VERSION,
  SAFARI_QA_KIND,
  SAFARI_QA_PACKAGE_NAME,
  SAFARI_QA_PACKAGE_VERSION,
  SAFARI_QA_REPORT_PREFIX,
  SAFARI_QA_TAR_SHA256,
  validatePassedSafariQaReport,
} from './iroha-js-candidate-safari-qa-contract.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(SCRIPT_DIR);
export const DEFAULT_SAFARI_QA_EVIDENCE = path.join(
  ROOT_DIR,
  'artifacts/iroha-js-candidate-safari-qa',
  SAFARI_QA_TAR_SHA256,
  'safari-26.5.2.json'
);
export const SAFARI_QA_EVIDENCE_MAX_BYTES = 128 * 1024;
const SAFARI_QA_MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

function fail(message) {
  throw new Error(`Iroha Safari QA evidence verification failed: ${message}`);
}

function exactKeys(value, expected, context) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${context} must be an object`);
  }
  if (JSON.stringify(Object.keys(value)) !== JSON.stringify(expected)) {
    fail(`${context} keys are not exact`);
  }
}

function exactString(value, pattern, context, maximum = 1_024) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    Buffer.byteLength(value, 'utf8') > maximum ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value) ||
    !pattern.test(value)
  ) {
    fail(`${context} is invalid`);
  }
  return value;
}

function exactUtcMillisecondTimestamp(value, context) {
  exactString(
    value,
    /^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u,
    context,
    32
  );
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    fail(`${context} is not a canonical UTC millisecond timestamp`);
  }
  if (millis > Date.now() + SAFARI_QA_MAX_CLOCK_SKEW_MS) {
    fail(`${context} must not be in the future`);
  }
  return millis;
}

export function verifySafariQaEvidence(value) {
  exactKeys(
    value,
    [
      'schemaVersion',
      'kind',
      'status',
      'observedAt',
      'candidateTarSha256',
      'packageName',
      'packageVersion',
      'assertionInventorySha256',
      'safariVersion',
      'nodeVersion',
      'esbuildVersion',
      'origin',
      'nonce',
      'bundleSha256',
      'bundleBytes',
      'bundleInputs',
      'candidatePackageInputs',
      'scenarioTotal',
      'assertionTotal',
      'reportSha256',
      'runtimeReport',
    ],
    'evidence'
  );
  if (value.schemaVersion !== 1) fail('unexpected schemaVersion');
  if (value.kind !== `${SAFARI_QA_KIND}-evidence`) fail('unexpected evidence kind');
  if (value.status !== 'passed') fail('evidence status is not passed');
  exactUtcMillisecondTimestamp(value.observedAt, 'observedAt');
  if (value.candidateTarSha256 !== SAFARI_QA_TAR_SHA256) fail('candidate tar digest mismatch');
  if (value.packageName !== SAFARI_QA_PACKAGE_NAME || value.packageVersion !== SAFARI_QA_PACKAGE_VERSION) {
    fail('candidate package identity mismatch');
  }
  if (value.assertionInventorySha256 !== SAFARI_QA_ASSERTION_INVENTORY_SHA256) {
    fail('assertion inventory digest mismatch');
  }
  const safariVersion = exactString(value.safariVersion, /^[0-9]+(?:\.[0-9]+){1,3}$/u, 'safariVersion', 32);
  exactString(value.nodeVersion, /^(?:24|25|26)\.[0-9]+\.[0-9]+$/u, 'nodeVersion', 32);
  if (value.esbuildVersion !== SAFARI_QA_ESBUILD_VERSION) fail('esbuild version mismatch');
  if (
    value.bundleSha256 !== SAFARI_QA_BUNDLE_SHA256 ||
    value.bundleBytes !== SAFARI_QA_BUNDLE_BYTES ||
    value.bundleInputs !== SAFARI_QA_BUNDLE_INPUTS ||
    value.candidatePackageInputs !== SAFARI_QA_CANDIDATE_PACKAGE_INPUTS
  ) {
    fail('pinned Safari bundle facts mismatch');
  }
  if (value.scenarioTotal !== 6 || value.assertionTotal !== 91) {
    fail('Safari scenario/assertion totals mismatch');
  }
  if (!/^[0-9a-f]{64}$/u.test(value.reportSha256)) fail('report digest is invalid');
  const validated = validatePassedSafariQaReport(value.runtimeReport, {
    nonce: value.nonce,
    origin: value.origin,
    bundleSha256: value.bundleSha256,
  });
  if (validated.scenarioTotal !== value.scenarioTotal || validated.assertionTotal !== value.assertionTotal) {
    fail('runtime report totals do not match evidence totals');
  }
  const reportText = `${SAFARI_QA_REPORT_PREFIX}${JSON.stringify(value.runtimeReport)}`;
  const digest = createHash('sha256').update(reportText, 'utf8').digest('hex');
  if (digest !== value.reportSha256) fail('runtime report digest mismatch');
  if (!value.runtimeReport.navigator.userAgent.includes(`Version/${safariVersion} `)) {
    fail('Safari application version does not match the runtime user agent');
  }
  return Object.freeze({
    safariVersion,
    scenarioTotal: validated.scenarioTotal,
    assertionTotal: validated.assertionTotal,
    reportSha256: digest,
  });
}

export function verifySafariQaEvidenceFile(file = DEFAULT_SAFARI_QA_EVIDENCE) {
  const absolute = path.resolve(file);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    fail(`evidence file is missing: ${absolute}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('evidence must be a regular non-symlink file');
  if (stat.size <= 0 || stat.size > SAFARI_QA_EVIDENCE_MAX_BYTES) {
    fail(`evidence must be from 1 through ${SAFARI_QA_EVIDENCE_MAX_BYTES} bytes`);
  }
  let value;
  try {
    value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch {
    fail('evidence is malformed JSON');
  }
  return verifySafariQaEvidence(value);
}

const invokedAsMain =
  process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url));
if (invokedAsMain) {
  if (process.argv.length > 3) fail('usage: verify-iroha-js-candidate-safari-qa-evidence.mjs [evidence-file]');
  const result = verifySafariQaEvidenceFile(process.argv[2]);
  process.stdout.write(
    `[iroha-safari-qa-evidence] Safari ${result.safariVersion}: ${result.scenarioTotal} scenarios / ${result.assertionTotal} assertions passed.\n`
  );
}
