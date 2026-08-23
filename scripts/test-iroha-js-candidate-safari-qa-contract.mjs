// Copyright 2026 Soramitsu Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import {
  SAFARI_QA_ASSERTION_IDS,
  SAFARI_QA_BUNDLE_SHA256,
  SAFARI_QA_MAX_REPORT_BYTES,
  SAFARI_QA_REPORT_PREFIX,
  buildSyntheticPassedSafariQaReport,
  parseAndValidateSafariQaReportText,
  validateSafariQaLoopbackOrigin,
  validateSafariQaNonce,
  validateSafariQaTimeoutMs,
  waitForSafariQaReport,
} from './iroha-js-candidate-safari-qa-contract.mjs';

const EXPECTED_CHECKS = 46;
const nonce = '11'.repeat(32);
const origin = 'http://127.0.0.1:49152';
const bundleSha256 = SAFARI_QA_BUNDLE_SHA256;
const context = { nonce, origin, bundleSha256 };
let passed = 0;

function fail(message) {
  throw new Error(`[iroha-safari-qa-contract-test] ${message}`);
}

async function expectSuccess(label, action) {
  try {
    await action();
  } catch (error) {
    fail(`${label} unexpectedly failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  passed += 1;
}

async function expectFailure(label, marker, action) {
  let observed;
  try {
    await action();
  } catch (error) {
    observed = error instanceof Error ? error.message : String(error);
  }
  if (observed === undefined) fail(`${label} unexpectedly passed`);
  if (marker && !observed.includes(marker)) {
    fail(`${label} reported ${JSON.stringify(observed)} instead of marker ${JSON.stringify(marker)}`);
  }
  passed += 1;
}

function freshReport() {
  return buildSyntheticPassedSafariQaReport(context);
}

function reportText(report = freshReport()) {
  return `${SAFARI_QA_REPORT_PREFIX}${JSON.stringify(report)}`;
}

function mutate(action) {
  const report = freshReport();
  action(report);
  return reportText(report);
}

await expectSuccess('canonical passed report', () => parseAndValidateSafariQaReportText(reportText(), context));
await expectSuccess('exact scenario and assertion totals', () => {
  const result = parseAndValidateSafariQaReportText(reportText(), context);
  if (result.scenarioTotal !== 6 || result.assertionTotal !== 91) fail('unexpected totals');
});
await expectFailure('expected nonce mismatch', 'launch nonce', () =>
  parseAndValidateSafariQaReportText(reportText(), { ...context, nonce: '33'.repeat(32) })
);
await expectFailure('report nonce tamper', 'launch nonce', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.nonce = '33'.repeat(32);
    }),
    context
  )
);
await expectFailure('report origin hostname tamper', 'bound loopback origin', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.origin = 'http://localhost:49152';
    }),
    context
  )
);
await expectFailure('report origin port tamper', 'bound loopback origin', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.origin = 'http://127.0.0.1:49153';
    }),
    context
  )
);
await expectFailure('candidate digest tamper', 'candidate tar digest', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.candidateTarSha256 = '00'.repeat(32);
    }),
    context
  )
);
await expectFailure('bundle digest tamper', 'bundle digest', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.bundleSha256 = '00'.repeat(32);
    }),
    context
  )
);
await expectFailure('assertion inventory digest tamper', 'inventory digest', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.assertionInventorySha256 = '00'.repeat(32);
    }),
    context
  )
);
await expectFailure('package identity tamper', 'package version', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.packageVersion = '0.0.4';
    }),
    context
  )
);
await expectFailure('navigator vendor tamper', 'vendor is not Safari', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.navigator.vendor = 'Attacker Browser';
    }),
    context
  )
);
await expectFailure('Chromium user agent spoof', 'not native Safari', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.navigator.userAgent = 'Mozilla/5.0 Chrome/126.0 Safari/537.36';
    }),
    context
  )
);
await expectFailure('missing assertion', 'assertion inventory', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.assertions.pop();
    }),
    context
  )
);
await expectFailure('extra assertion', 'assertion inventory', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.assertions.push({ id: 'attacker.extra', passed: true });
    }),
    context
  )
);
await expectFailure('duplicate assertion', 'assertion inventory', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.assertions[1] = { ...report.assertions[0] };
    }),
    context
  )
);
await expectFailure('reordered assertion', 'assertion inventory', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      [report.assertions[0], report.assertions[1]] = [report.assertions[1], report.assertions[0]];
    }),
    context
  )
);
await expectFailure('false assertion', 'assertion inventory', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.assertions[0].passed = false;
    }),
    context
  )
);
await expectFailure('scenario count tamper', 'scenario summary', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.scenarios[0].assertions += 1;
    }),
    context
  )
);
await expectFailure('missing scenario', 'scenario summary', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.scenarios.pop();
    }),
    context
  )
);
await expectFailure('explicit failed report', 'synthetic failure', () =>
  parseAndValidateSafariQaReportText(
    `${SAFARI_QA_REPORT_PREFIX}${JSON.stringify({
      schemaVersion: 1,
      kind: 'fearless-iroha-js-candidate-safari-qa',
      status: 'failed',
      failure: 'synthetic failure',
    })}`,
    context
  )
);
await expectFailure('schema tamper', 'schemaVersion', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.schemaVersion = 2;
    }),
    context
  )
);
await expectFailure('kind tamper', 'report kind', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.kind = 'attacker-report';
    }),
    context
  )
);
await expectFailure('malformed JSON', 'malformed JSON', () =>
  parseAndValidateSafariQaReportText(`${SAFARI_QA_REPORT_PREFIX}{`, context)
);
await expectFailure('duplicate JSON key', 'canonical JSON', () => {
  const json = JSON.stringify(freshReport()).replace('"status":"passed"', '"status":"passed","status":"passed"');
  return parseAndValidateSafariQaReportText(`${SAFARI_QA_REPORT_PREFIX}${json}`, context);
});
await expectFailure('missing report prefix', 'exact report prefix', () =>
  parseAndValidateSafariQaReportText(JSON.stringify(freshReport()), context)
);
await expectFailure('duplicate report prefix', 'more than one report prefix', () =>
  parseAndValidateSafariQaReportText(`${reportText()}${SAFARI_QA_REPORT_PREFIX}`, context)
);
await expectFailure('oversized report', 'exceeds', () =>
  parseAndValidateSafariQaReportText('x'.repeat(SAFARI_QA_MAX_REPORT_BYTES + 1), context)
);
await expectFailure('HTTPS expected origin', 'exact credential-free', () =>
  validateSafariQaLoopbackOrigin('https://127.0.0.1:49152')
);
await expectFailure('credentialed expected origin', 'exact credential-free', () =>
  validateSafariQaLoopbackOrigin('http://user:secret@127.0.0.1:49152')
);
await expectFailure('pathed expected origin', 'exact credential-free', () =>
  validateSafariQaLoopbackOrigin('http://127.0.0.1:49152/path')
);
await expectFailure('queried expected origin', 'exact credential-free', () =>
  validateSafariQaLoopbackOrigin('http://127.0.0.1:49152?target=evil')
);
await expectFailure('invalid nonce', 'lowercase hexadecimal', () => validateSafariQaNonce('GG'.repeat(32)));
await expectFailure('timeout below floor', 'timeout must be', () => validateSafariQaTimeoutMs(4_999));
await expectFailure('timeout above ceiling', 'timeout must be', () => validateSafariQaTimeoutMs(60_001));
await expectSuccess('bounded report polling succeeds', async () => {
  let reads = 0;
  let clock = 0;
  const result = await waitForSafariQaReport(
    async () => {
      reads += 1;
      return reads === 3 ? reportText() : 'Fearless Iroha Safari QA running';
    },
    {
      timeoutMs: 5_000,
      pollIntervalMs: 100,
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
    }
  );
  if (result !== reportText() || reads !== 3) fail('polling did not return the exact report');
});
await expectFailure('report polling timeout', 'timed out', async () => {
  let clock = 0;
  return waitForSafariQaReport(async () => 'still running', {
    timeoutMs: 5_000,
    pollIntervalMs: 1_000,
    now: () => clock,
    sleep: async (milliseconds) => {
      clock += milliseconds;
    },
  });
});
await expectFailure('report polling oversize', 'exceeds', () =>
  waitForSafariQaReport(async () => 'x'.repeat(SAFARI_QA_MAX_REPORT_BYTES + 1), {
    timeoutMs: 5_000,
  })
);
await expectFailure('report polling non-string', 'non-string', () =>
  waitForSafariQaReport(async () => ({ attacker: true }), { timeoutMs: 5_000 })
);
await expectFailure('poll interval below floor', 'poll interval', () =>
  waitForSafariQaReport(async () => 'running', { timeoutMs: 5_000, pollIntervalMs: 9 })
);
await expectFailure('report extra top-level key', 'report keys', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.attacker = true;
    }),
    context
  )
);
await expectFailure('navigator extra key', 'navigator keys', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.navigator.attacker = true;
    }),
    context
  )
);
await expectFailure('assertion extra key', 'assertion inventory', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.assertions[0].attacker = true;
    }),
    context
  )
);
await expectFailure('noncanonical JSON whitespace', 'canonical JSON', () => {
  const json = JSON.stringify(freshReport());
  return parseAndValidateSafariQaReportText(
    `${SAFARI_QA_REPORT_PREFIX}${json.slice(0, -1)}, "attacker":false}`,
    context
  );
});
await expectFailure('navigator control characters', 'control characters', () =>
  parseAndValidateSafariQaReportText(
    mutate((report) => {
      report.navigator.userAgent += '\u0000';
    }),
    context
  )
);
await expectFailure('uppercase expected bundle digest', 'lowercase hexadecimal', () =>
  parseAndValidateSafariQaReportText(reportText(), {
    ...context,
    bundleSha256: bundleSha256.toUpperCase(),
  })
);
await expectSuccess('inventory is numerous and duplicate-free', () => {
  if (SAFARI_QA_ASSERTION_IDS.length !== 91) fail('assertion inventory is not 91');
  if (new Set(SAFARI_QA_ASSERTION_IDS).size !== 91) fail('assertion inventory is duplicated');
});

if (passed !== EXPECTED_CHECKS) {
  fail(`internal check inventory changed: expected ${EXPECTED_CHECKS}, found ${passed}`);
}
process.stdout.write(`[iroha-safari-qa-contract-test] ${passed} checks passed.\n`);
