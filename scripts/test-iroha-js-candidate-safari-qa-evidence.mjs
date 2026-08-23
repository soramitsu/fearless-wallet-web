// Copyright 2026 Soramitsu Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import { DEFAULT_SAFARI_QA_EVIDENCE, verifySafariQaEvidence } from './verify-iroha-js-candidate-safari-qa-evidence.mjs';

const EXPECTED_CHECKS = 21;
const canonical = JSON.parse(fs.readFileSync(DEFAULT_SAFARI_QA_EVIDENCE, 'utf8'));
let passed = 0;

function fail(message) {
  throw new Error(`[iroha-safari-qa-evidence-test] ${message}`);
}

function fresh() {
  return structuredClone(canonical);
}

function expectSuccess(label, action) {
  try {
    action();
  } catch (error) {
    fail(`${label} unexpectedly failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  passed += 1;
}

function expectFailure(label, marker, action) {
  let observed;
  try {
    action();
  } catch (error) {
    observed = error instanceof Error ? error.message : String(error);
  }
  if (observed === undefined) fail(`${label} unexpectedly passed`);
  if (!observed.includes(marker)) fail(`${label} did not report ${marker}: ${observed}`);
  passed += 1;
}

function mutate(action) {
  const value = fresh();
  action(value);
  return value;
}

expectSuccess('canonical evidence', () => verifySafariQaEvidence(fresh()));
expectFailure('status tamper', 'status', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.status = 'failed';
    })
  )
);
expectFailure('timestamp tamper', 'observedAt', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.observedAt = 'not-a-time';
    })
  )
);
expectFailure('impossible calendar timestamp', 'canonical UTC millisecond timestamp', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.observedAt = '2026-02-30T12:00:00.000Z';
    })
  )
);
expectFailure('impossible hour timestamp', 'canonical UTC millisecond timestamp', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.observedAt = '2026-07-13T29:00:00.000Z';
    })
  )
);
expectFailure('future observation timestamp', 'must not be in the future', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.observedAt = '2099-01-01T00:00:00.000Z';
    })
  )
);
expectFailure('tar digest tamper', 'candidate tar digest', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.candidateTarSha256 = '00'.repeat(32);
    })
  )
);
expectFailure('package tamper', 'package identity', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.packageVersion = '0.0.4';
    })
  )
);
expectFailure('Safari version tamper', 'application version', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.safariVersion = '99.0';
    })
  )
);
expectFailure('Node version tamper', 'nodeVersion', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.nodeVersion = '23.0.0';
    })
  )
);
expectFailure('bundle digest tamper', 'bundle facts', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.bundleSha256 = '00'.repeat(32);
    })
  )
);
expectFailure('bundle byte tamper', 'bundle facts', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.bundleBytes += 1;
    })
  )
);
expectFailure('input count tamper', 'bundle facts', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.bundleInputs -= 1;
    })
  )
);
expectFailure('scenario total tamper', 'totals', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.scenarioTotal += 1;
    })
  )
);
expectFailure('assertion total tamper', 'totals', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.assertionTotal -= 1;
    })
  )
);
expectFailure('report digest tamper', 'report digest mismatch', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.reportSha256 = '00'.repeat(32);
    })
  )
);
expectFailure('report nonce tamper', 'launch nonce', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.runtimeReport.nonce = '00'.repeat(32);
    })
  )
);
expectFailure('report origin tamper', 'bound loopback origin', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.runtimeReport.origin = 'http://127.0.0.1:65535';
    })
  )
);
expectFailure('report assertion tamper', 'assertion inventory', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.runtimeReport.assertions[0].passed = false;
    })
  )
);
expectFailure('extra evidence field', 'evidence keys', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.attacker = true;
    })
  )
);
expectFailure('inventory digest tamper', 'inventory digest', () =>
  verifySafariQaEvidence(
    mutate((value) => {
      value.assertionInventorySha256 = '00'.repeat(32);
    })
  )
);

if (passed !== EXPECTED_CHECKS) {
  fail(`internal check inventory changed: expected ${EXPECTED_CHECKS}, found ${passed}`);
}
process.stdout.write(`[iroha-safari-qa-evidence-test] ${passed} checks passed.\n`);
