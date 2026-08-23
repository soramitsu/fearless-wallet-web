#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BoundedOutput,
  VERIFIED_FIREFOX_VERSION,
  assertCspState,
  assertFirefoxVersionResult,
  assertFirefoxWorkflowContract,
  assertPinnedFirefoxVersion,
  assertPopupState,
  createSmokeEnvironment,
  findRuntimeErrors,
  isPopupUrl,
  processTreeExistsAfterProbeError,
  requireCiFirefoxBinary,
  withTimeout,
} from './firefox-extension-smoke-policy.mjs';

let assertions = 0;

function expectFailure(label, operation, expected) {
  assert.throws(operation, expected, label);
  assertions += 1;
}

const ciWorkflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const configuredFirefoxVersions = [...ciWorkflow.matchAll(/^\s*firefox-version:\s*([^\s#]+)\s*(?:#.*)?$/gmu)].map(
  (match) => match[1]
);
assert.deepEqual(configuredFirefoxVersions, [VERIFIED_FIREFOX_VERSION]);
assert.equal(assertPinnedFirefoxVersion(configuredFirefoxVersions[0]), VERIFIED_FIREFOX_VERSION);
assertFirefoxWorkflowContract(ciWorkflow);
assertions += 3;
for (const [label, mutation] of [
  ['missing setup step id', (value) => value.replace('id: setup-firefox', 'id: unbound-firefox')],
  [
    'detached setup and runtime steps',
    (value) => value.replace('\n\n      - name: Firefox extension runtime', '\n\n      - name: Interposed unpinned step\n        run: true\n\n      - name: Firefox extension runtime'),
  ],
  [
    'wrong setup output binding',
    (value) => value.replace('steps.setup-firefox.outputs.firefox-path', 'steps.other.outputs.firefox-path'),
  ],
]) {
  expectFailure(label, () => assertFirefoxWorkflowContract(mutation(ciWorkflow)), /exact contiguous CI block/);
}
for (const version of ['latest', 'beta', 'nightly', 'esr', '152', '152.0', '152.0.4-beta', '0152.0.4']) {
  expectFailure(
    `mutable or partial Firefox version ${version}`,
    () => assertPinnedFirefoxVersion(version),
    /immutable/
  );
}

assert.equal(
  requireCiFirefoxBinary({ GITHUB_ACTIONS: 'true', FIREFOX_BINARY: '/opt/firefox/firefox' }),
  '/opt/firefox/firefox'
);
assert.equal(requireCiFirefoxBinary({ GITHUB_ACTIONS: 'false' }), null);
assertions += 2;
for (const [label, candidate] of [
  ['missing CI Firefox path', undefined],
  ['relative CI Firefox path', 'firefox'],
  ['control-bearing CI Firefox path', '/opt/firefox\nforged'],
]) {
  expectFailure(
    label,
    () => requireCiFirefoxBinary({ GITHUB_ACTIONS: 'true', FIREFOX_BINARY: candidate }),
    /absolute FIREFOX_BINARY/
  );
}

assert.equal(
  assertFirefoxVersionResult({ status: 0, signal: null, stdout: 'Mozilla Firefox 152.0.4\n', stderr: '' }),
  VERIFIED_FIREFOX_VERSION
);
assertions += 1;
for (const [label, result, expected] of [
  [
    'mismatched executable Firefox version',
    { status: 0, signal: null, stdout: 'Mozilla Firefox 152.0.3\n', stderr: '' },
    /version mismatch/,
  ],
  ['missing executable Firefox version', { status: 0, signal: null, stdout: '', stderr: '' }, /exactly one/],
  [
    'ambiguous executable Firefox version',
    {
      status: 0,
      signal: null,
      stdout: 'Mozilla Firefox 152.0.4\nMozilla Firefox 999.0.0\n',
      stderr: '',
    },
    /exactly one/,
  ],
  ['failed executable Firefox version probe', { status: 1, signal: null, stdout: '', stderr: '' }, /exited 1/],
  ['signaled executable Firefox version probe', { status: null, signal: 'SIGKILL', stdout: '', stderr: '' }, /signal/],
]) {
  expectFailure(label, () => assertFirefoxVersionResult(result), expected);
}

const output = new BoundedOutput(8);
output.append('older');
output.append('12345678newest');
assert.equal(output.value, '78newest');
assert.match(output.toString(), /earlier Firefox output truncated/);
assertions += 2;
expectFailure('invalid output bound', () => new BoundedOutput(0), /positive safe integer/);

let cancelled = false;
await assert.rejects(
  withTimeout(new Promise(() => {}), 5, 'stalled RDP request', () => {
    cancelled = true;
  }),
  /stalled RDP request timed out/
);
assert.equal(cancelled, true);
assert.equal(await withTimeout(Promise.resolve('ok'), 50, 'fast request'), 'ok');
assertions += 3;

const prefix = 'moz-extension://expected/popup.html';
assert.equal(isPopupUrl(`${prefix}#/`, prefix), true);
assert.equal(isPopupUrl(`${prefix}.attacker.invalid#/`, prefix), false);
assert.equal(isPopupUrl(`${prefix}?redirect=https://attacker.invalid`, prefix), false);
assertions += 3;

const validPopup = {
  readyState: 'complete',
  title: 'FEARLESS',
  href: `${prefix}#/onboarding`,
  app: true,
  vueMounted: true,
  appHtmlLength: 500,
  body: 'Welcome to the Fearless wallet extension',
  interactiveElements: 2,
};
assertPopupState(validPopup, prefix);
assertions += 1;
for (const [label, override, expected] of [
  ['wrong origin', { href: 'https://attacker.invalid/' }, /URL escaped/],
  ['missing app', { app: false }, /root is missing/],
  ['unmounted Vue', { vueMounted: false }, /did not mark/],
  ['short app', { appHtmlLength: 99 }, /meaningful UI/],
  ['empty body', { body: ' ' }, /unexpectedly empty/],
  ['no controls', { interactiveElements: 0 }, /no interactive controls/],
]) {
  expectFailure(label, () => assertPopupState({ ...validPopup, ...override }, prefix), expected);
}

assertCspState({
  blocked: true,
  nativeFunction: true,
  name: 'EvalError',
  message: 'localized non-empty diagnostic',
});
assertions += 1;
expectFailure('CSP permits Function', () => assertCspState({ blocked: false, value: 1 }), /allowed dynamic Function/);
expectFailure(
  'unrelated exception',
  () => assertCspState({ blocked: true, nativeFunction: true, name: 'TypeError', message: 'unrelated' }),
  /allowed dynamic Function/
);
expectFailure(
  'monkeypatched Function',
  () =>
    assertCspState({
      blocked: true,
      nativeFunction: false,
      name: 'EvalError',
      message: 'forged CSP failure',
    }),
  /allowed dynamic Function/
);

const runtimeErrors = findRuntimeErrors(
  'ordinary startup\nJavaScript error: moz-extension://id/popup.js, line 1: boom\nUnhandled Promise Rejection: no\nconsole.error: startup failed\n'
);
assert.equal(runtimeErrors.length, 3);
assert.equal(findRuntimeErrors('caught CSP EvalError during the intentional probe').length, 0);
assertions += 2;

const cleanEnvironment = createSmokeEnvironment({
  PATH: '/bin',
  WEB_EXT_FIREFOX: '/attacker/firefox',
  NODE_OPTIONS: '--require=/tmp/inject.js',
  NODE_PATH: '/tmp/inject',
});
assert.deepEqual(cleanEnvironment, { PATH: '/bin' });
assertions += 1;

assert.equal(processTreeExistsAfterProbeError({ code: 'ESRCH' }), false);
assert.equal(processTreeExistsAfterProbeError({ code: 'EPERM' }), true);
expectFailure(
  'unexpected process probe failure',
  () => processTreeExistsAfterProbeError(Object.assign(new Error('unexpected'), { code: 'EIO' })),
  /unexpected/
);
assertions += 2;

console.log(`[firefox-extension-smoke-policy-test] all ${assertions} adversarial assertions passed`);
