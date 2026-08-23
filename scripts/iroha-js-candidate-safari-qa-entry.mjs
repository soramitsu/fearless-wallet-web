// Copyright 2026 Soramitsu Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

const initialGlobalBufferAbsent = typeof globalThis.Buffer === 'undefined';
const rawConfig = globalThis.__FEARLESS_IROHA_SAFARI_QA_CONFIG__;

function safeFailure(error) {
  let message = 'unknown Safari runtime failure';
  try {
    if (error instanceof Error && typeof error.message === 'string') message = error.message;
  } catch {
    // Hostile thrown values remain opaque.
  }
  return message.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').slice(0, 512);
}

function render(report) {
  const prefix =
    rawConfig && typeof rawConfig.reportPrefix === 'string'
      ? rawConfig.reportPrefix
      : 'FEARLESS_IROHA_SAFARI_QA_REPORT:';
  document.body.replaceChildren();
  const output = document.createElement('pre');
  output.id = 'fearless-iroha-safari-qa-report';
  output.textContent = `${prefix}${JSON.stringify(report)}`;
  document.body.append(output);
}

Promise.resolve()
  .then(() => import('./iroha-js-candidate-safari-qa-suite.mjs'))
  .then(({ runSafariCandidateQa }) => runSafariCandidateQa({ rawConfig, initialGlobalBufferAbsent }))
  .then(render)
  .catch((error) => {
    render({
      schemaVersion: 1,
      kind: 'fearless-iroha-js-candidate-safari-qa',
      status: 'failed',
      failure: safeFailure(error),
    });
  });
