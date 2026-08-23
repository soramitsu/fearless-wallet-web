// Copyright 2026 Soramitsu Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';

export const SAFARI_QA_SCHEMA_VERSION = 1;
export const SAFARI_QA_KIND = 'fearless-iroha-js-candidate-safari-qa';
export const SAFARI_QA_REPORT_PREFIX = 'FEARLESS_IROHA_SAFARI_QA_REPORT:';
export const SAFARI_QA_TAR_SHA256 = '15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8';
export const SAFARI_QA_BUNDLE_SHA256 = 'f7781764f541f2c27b70b36f92bda81cddcad128918de73d67404746474a04ab';
export const SAFARI_QA_BUNDLE_BYTES = 1_127_726;
export const SAFARI_QA_BUNDLE_INPUTS = 79;
export const SAFARI_QA_CANDIDATE_PACKAGE_INPUTS = 39;
export const SAFARI_QA_PACKAGE_NAME = '@iroha/iroha-js';
export const SAFARI_QA_PACKAGE_VERSION = '0.0.3';
export const SAFARI_QA_ESBUILD_VERSION = '0.28.1';
export const SAFARI_QA_MAX_REPORT_BYTES = 64 * 1024;
export const SAFARI_QA_MIN_TIMEOUT_MS = 5_000;
export const SAFARI_QA_MAX_TIMEOUT_MS = 60_000;

export const SAFARI_QA_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'runtime_identity',
    assertions: Object.freeze([
      'runtime.protocol',
      'runtime.hostname',
      'runtime.origin',
      'runtime.pathname_nonce',
      'runtime.navigator_vendor',
      'runtime.navigator_safari',
      'runtime.navigator_not_chromium',
      'runtime.crypto_subtle',
      'runtime.text_encoder',
      'runtime.global_buffer_initially_absent',
    ]),
  }),
  Object.freeze({
    id: 'package_surface',
    assertions: Object.freeze([
      'surface.address',
      'surface.browser',
      'surface.transaction_codec',
      'surface.normalizers',
      'surface.blake2b',
      'surface.ivm_artifact',
      'surface.instruction_builders',
      'surface.torii',
      'surface.torii_browser',
      'surface.norito',
      'surface.offline_cash',
      'surface.canonical_request',
      'surface.sccp',
      'surface.sorafs',
      'surface.crypto',
      'surface.connect_browser',
      'surface.nexus_app',
      'surface.kotodama_compiler',
      'surface.exact_namespace_count',
    ]),
  }),
  Object.freeze({
    id: 'transaction_codec_positive',
    assertions: Object.freeze([
      'codec.api_builder',
      'codec.api_payload_hash',
      'codec.api_validate',
      'codec.api_finalize',
      'codec.api_signed_hash',
      'codec.address_authority',
      'codec.address_destination',
      'codec.payload_nonempty',
      'codec.payload_deterministic',
      'codec.metadata_canonical',
      'codec.payload_hash_format',
      'codec.payload_hash_golden',
      'codec.signable_authority',
      'codec.signable_key',
      'codec.signature_length',
      'codec.finalized_version',
      'codec.finalized_hash_format',
      'codec.finalized_hash_recomputed',
      'codec.finalized_hash_golden',
      'codec.global_buffer_after_positive',
    ]),
  }),
  Object.freeze({
    id: 'transaction_codec_negative',
    assertions: Object.freeze([
      'codec.reject_unknown_field',
      'codec.reject_inherited_input',
      'codec.reject_quantity_zero',
      'codec.reject_quantity_leading_zero',
      'codec.reject_quantity_fractional_zero',
      'codec.reject_quantity_exponent',
      'codec.reject_nonce_zero',
      'codec.reject_holding_authority_mismatch',
      'codec.reject_cyclic_metadata',
      'codec.reject_lone_surrogate',
      'codec.reject_chain_bound',
      'codec.reject_quantity_bound',
      'codec.reject_payload_hash_mismatch',
      'codec.reject_authority_mismatch',
      'codec.reject_signing_key_mismatch',
      'codec.reject_signature_tamper',
      'codec.proxy_get_trap_not_invoked',
      'codec.accessor_not_invoked',
    ]),
  }),
  Object.freeze({
    id: 'canonical_request',
    assertions: Object.freeze([
      'canonical.query_order',
      'canonical.message_type',
      'canonical.message_golden',
      'canonical.json_method',
      'canonical.json_body',
      'canonical.account_header',
      'canonical.nonce_header',
      'canonical.timestamp_header',
      'canonical.signature_valid',
      'canonical.global_buffer_after_request',
    ]),
  }),
  Object.freeze({
    id: 'nexus_browser',
    assertions: Object.freeze([
      'nexus.hash_matches_codec',
      'nexus.reject_url_scheme',
      'nexus.reject_url_credentials',
      'nexus.reject_url_query',
      'nexus.reject_url_fragment',
      'nexus.submit_url',
      'nexus.submit_method',
      'nexus.submit_content_type',
      'nexus.submit_credentials',
      'nexus.submit_redirect',
      'nexus.submit_referrer',
      'nexus.submit_body',
      'nexus.response_hash',
      'nexus.global_buffer_after_submit',
    ]),
  }),
]);

export const SAFARI_QA_ASSERTION_IDS = Object.freeze(SAFARI_QA_SCENARIOS.flatMap((scenario) => scenario.assertions));

export const SAFARI_QA_ASSERTION_INVENTORY_SHA256 = createHash('sha256')
  .update(`${SAFARI_QA_ASSERTION_IDS.join('\n')}\n`, 'utf8')
  .digest('hex');

function fail(message) {
  throw new Error(`Iroha Safari QA contract violation: ${message}`);
}

function exactObjectKeys(value, expected, context) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${context} must be an object`);
  }
  const actual = Object.keys(value);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${context} keys are not exact`);
  }
}

function exactHex(value, bytes, context) {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)) {
    fail(`${context} must be exactly ${bytes} lowercase hexadecimal bytes`);
  }
  return value;
}

function exactString(value, context, maximumBytes = 4_096) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(`${context} must be a non-empty exact string`);
  }
  if (Buffer.byteLength(value, 'utf8') > maximumBytes) {
    fail(`${context} exceeds ${maximumBytes} bytes`);
  }
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    fail(`${context} contains control characters`);
  }
  return value;
}

export function validateSafariQaTimeoutMs(value) {
  if (!Number.isSafeInteger(value) || value < SAFARI_QA_MIN_TIMEOUT_MS || value > SAFARI_QA_MAX_TIMEOUT_MS) {
    fail(
      `timeout must be an integer from ${SAFARI_QA_MIN_TIMEOUT_MS} through ${SAFARI_QA_MAX_TIMEOUT_MS} milliseconds`
    );
  }
  return value;
}

export function validateSafariQaLoopbackOrigin(value) {
  exactString(value, 'origin', 128);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('origin must be an absolute URL');
  }
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !/^[1-9][0-9]{0,4}$/u.test(parsed.port) ||
    Number(parsed.port) > 65_535 ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== value
  ) {
    fail('origin must be an exact credential-free http://127.0.0.1:<port> origin');
  }
  return value;
}

export function validateSafariQaNonce(value) {
  return exactHex(value, 32, 'nonce');
}

function scenarioSummary() {
  return SAFARI_QA_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    assertions: scenario.assertions.length,
    passed: scenario.assertions.length,
    failed: 0,
  }));
}

export function buildSyntheticPassedSafariQaReport({
  nonce,
  origin,
  bundleSha256,
  userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/26.5 Safari/605.1.15',
} = {}) {
  validateSafariQaNonce(nonce);
  validateSafariQaLoopbackOrigin(origin);
  exactHex(bundleSha256, 32, 'bundleSha256');
  if (bundleSha256 !== SAFARI_QA_BUNDLE_SHA256) fail('bundleSha256 is not the pinned QA bundle');
  return {
    schemaVersion: SAFARI_QA_SCHEMA_VERSION,
    kind: SAFARI_QA_KIND,
    status: 'passed',
    nonce,
    origin,
    candidateTarSha256: SAFARI_QA_TAR_SHA256,
    bundleSha256,
    packageName: SAFARI_QA_PACKAGE_NAME,
    packageVersion: SAFARI_QA_PACKAGE_VERSION,
    assertionInventorySha256: SAFARI_QA_ASSERTION_INVENTORY_SHA256,
    navigator: {
      vendor: 'Apple Computer, Inc.',
      userAgent,
      platform: 'MacIntel',
      language: 'en-US',
    },
    scenarios: scenarioSummary(),
    assertions: SAFARI_QA_ASSERTION_IDS.map((id) => ({ id, passed: true })),
  };
}

export function validatePassedSafariQaReport(report, { nonce, origin, bundleSha256 }) {
  validateSafariQaNonce(nonce);
  validateSafariQaLoopbackOrigin(origin);
  exactHex(bundleSha256, 32, 'expected bundleSha256');
  if (bundleSha256 !== SAFARI_QA_BUNDLE_SHA256) fail('expected bundleSha256 is not pinned');
  exactObjectKeys(
    report,
    [
      'schemaVersion',
      'kind',
      'status',
      'nonce',
      'origin',
      'candidateTarSha256',
      'bundleSha256',
      'packageName',
      'packageVersion',
      'assertionInventorySha256',
      'navigator',
      'scenarios',
      'assertions',
    ],
    'report'
  );
  if (report.schemaVersion !== SAFARI_QA_SCHEMA_VERSION) fail('unexpected schemaVersion');
  if (report.kind !== SAFARI_QA_KIND) fail('unexpected report kind');
  if (report.status !== 'passed') fail('Safari runtime reported a failure');
  if (report.nonce !== nonce) fail('report nonce does not match the launch nonce');
  if (report.origin !== origin) fail('report origin does not match the bound loopback origin');
  if (report.candidateTarSha256 !== SAFARI_QA_TAR_SHA256) {
    fail('report candidate tar digest does not match the pinned final candidate');
  }
  if (report.bundleSha256 !== bundleSha256) fail('report bundle digest does not match');
  if (report.packageName !== SAFARI_QA_PACKAGE_NAME) fail('unexpected package name');
  if (report.packageVersion !== SAFARI_QA_PACKAGE_VERSION) fail('unexpected package version');
  if (report.assertionInventorySha256 !== SAFARI_QA_ASSERTION_INVENTORY_SHA256) {
    fail('assertion inventory digest does not match');
  }

  exactObjectKeys(report.navigator, ['vendor', 'userAgent', 'platform', 'language'], 'report.navigator');
  if (report.navigator.vendor !== 'Apple Computer, Inc.') fail('navigator vendor is not Safari');
  const userAgent = exactString(report.navigator.userAgent, 'navigator.userAgent', 1_024);
  if (!/Safari\//u.test(userAgent) || /(?:Chrome|Chromium|CriOS|Edg)\//u.test(userAgent)) {
    fail('navigator user agent is not native Safari');
  }
  exactString(report.navigator.platform, 'navigator.platform', 128);
  exactString(report.navigator.language, 'navigator.language', 128);

  if (JSON.stringify(report.scenarios) !== JSON.stringify(scenarioSummary())) {
    fail('scenario summary is not exact');
  }
  const expectedAssertions = SAFARI_QA_ASSERTION_IDS.map((id) => ({ id, passed: true }));
  if (JSON.stringify(report.assertions) !== JSON.stringify(expectedAssertions)) {
    fail('assertion inventory, order, or result is not exact');
  }
  return Object.freeze({
    report,
    scenarioTotal: SAFARI_QA_SCENARIOS.length,
    assertionTotal: SAFARI_QA_ASSERTION_IDS.length,
  });
}

export function parseAndValidateSafariQaReportText(text, expected) {
  if (typeof text !== 'string') fail('document text must be a string');
  if (Buffer.byteLength(text, 'utf8') > SAFARI_QA_MAX_REPORT_BYTES) {
    fail(`document text exceeds ${SAFARI_QA_MAX_REPORT_BYTES} bytes`);
  }
  const normalized = text.replace(/[\r\n]+$/u, '');
  if (!normalized.startsWith(SAFARI_QA_REPORT_PREFIX)) {
    fail('document text does not start with the exact report prefix');
  }
  if (normalized.indexOf(SAFARI_QA_REPORT_PREFIX, SAFARI_QA_REPORT_PREFIX.length) !== -1) {
    fail('document text contains more than one report prefix');
  }
  const json = normalized.slice(SAFARI_QA_REPORT_PREFIX.length);
  if (!json || Buffer.byteLength(json, 'utf8') > SAFARI_QA_MAX_REPORT_BYTES) {
    fail('report JSON is empty or oversized');
  }
  let report;
  try {
    report = JSON.parse(json);
  } catch {
    fail('report is malformed JSON');
  }
  if (JSON.stringify(report) !== json) {
    fail('report JSON must use exact canonical JSON serialization');
  }
  if (report?.status === 'failed') {
    exactObjectKeys(report, ['schemaVersion', 'kind', 'status', 'failure'], 'failed report');
    if (report.schemaVersion !== SAFARI_QA_SCHEMA_VERSION || report.kind !== SAFARI_QA_KIND) {
      fail('failed report identity is not exact');
    }
    fail(`Safari runtime failed: ${exactString(report.failure, 'failed report.failure', 512)}`);
  }
  return validatePassedSafariQaReport(report, expected);
}

export async function waitForSafariQaReport(
  readDocumentText,
  {
    timeoutMs,
    pollIntervalMs = 100,
    now = () => Date.now(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }
) {
  if (typeof readDocumentText !== 'function') fail('report reader must be a function');
  validateSafariQaTimeoutMs(timeoutMs);
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 10 || pollIntervalMs > 1_000) {
    fail('poll interval must be an integer from 10 through 1000 milliseconds');
  }
  const startedAt = now();
  for (;;) {
    const text = await readDocumentText();
    if (typeof text !== 'string') fail('document reader returned a non-string value');
    if (Buffer.byteLength(text, 'utf8') > SAFARI_QA_MAX_REPORT_BYTES) {
      fail(`document text exceeds ${SAFARI_QA_MAX_REPORT_BYTES} bytes`);
    }
    if (text.includes(SAFARI_QA_REPORT_PREFIX)) return text;
    if (now() - startedAt >= timeoutMs) fail(`timed out after ${timeoutMs} milliseconds`);
    await sleep(pollIntervalMs);
  }
}
