#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  canonicalFirefoxBuildWarning,
  createFirefoxBuildLogPolicy,
  createFirefoxBuildWarningHandler,
  normalizePolkadotPackageInfoForIife,
} from './firefox-build-warning-policy.mjs';

const rootDir = '/workspace/fearless-wallet-web';
let assertions = 0;

function expectFailure(label, operation, expected) {
  assert.throws(operation, expected, label);
  assertions += 1;
}

function warning(overrides = {}) {
  return {
    code: 'INVALID_ANNOTATION',
    id: `${rootDir}/node_modules/@polkadot/x-global/index.js`,
    loc: { line: 9, column: 23 },
    message:
      '[INVALID_ANNOTATION] A comment "/*#__PURE__*/" in "node_modules/@polkadot/x-global/index.js" contains an annotation that Rolldown cannot interpret due to the position of the comment.',
    ...overrides,
  };
}

const forwarded = [];
const handler = createFirefoxBuildWarningHandler({ buildTarget: 'popup', rootDir });
handler('warn', warning(), (level, log) => forwarded.push({ level, log }));
assert.equal(forwarded.length, 1);
assert.equal(forwarded[0].log.code, 'INVALID_ANNOTATION');
assertions += 2;

handler('info', { message: 'ordinary build information' }, (level, log) => forwarded.push({ level, log }));
assert.equal(forwarded.at(-1)?.level, 'info');
assertions += 1;

expectFailure(
  'new warning code',
  () => handler('warn', warning({ code: 'NEW_WARNING' }), () => {}),
  /unreviewed popup warning/
);
expectFailure(
  'annotation source drift',
  () => handler('warn', warning({ id: `${rootDir}/node_modules/new-package/index.js` }), () => {}),
  /unreviewed popup warning/
);
expectFailure(
  'annotation location drift',
  () => handler('warn', warning({ loc: { line: 10, column: 23 } }), () => {}),
  /unreviewed popup warning/
);
expectFailure(
  'annotation message drift',
  () => handler('warn', warning({ message: '[INVALID_ANNOTATION] changed meaning' }), () => {}),
  /unreviewed popup warning/
);
expectFailure(
  'runtime-relevant empty import.meta',
  () => handler('warn', warning({ code: 'EMPTY_IMPORT_META' }), () => {}),
  /unreviewed popup warning/
);

handler(
  'warn',
  {
    code: 'INEFFECTIVE_DYNAMIC_IMPORT',
    id: `${rootDir}/src/screens/extension-ui/ManageAuths.vue`,
    message:
      '[INEFFECTIVE_DYNAMIC_IMPORT] src/screens/extension-ui/ManageAuths.vue is dynamically imported by src/router/routes.ts but also statically imported by src/screens/main/Main.vue?vue&type=script&lang.ts, dynamic import will not move module into another chunk.',
  },
  () => {}
);
assertions += 1;
expectFailure(
  'dynamic import source drift',
  () =>
    handler(
      'warn',
      {
        code: 'INEFFECTIVE_DYNAMIC_IMPORT',
        id: `${rootDir}/src/screens/extension-ui/Other.vue`,
        message: 'unexpected dynamic import warning',
      },
      () => {}
    ),
  /unreviewed popup warning/
);
expectFailure('missing downstream handler', () => handler('warn', warning(), null), /log handler must be a function/);
expectFailure(
  'unknown build target',
  () => createFirefoxBuildWarningHandler({ buildTarget: 'unknown', rootDir }),
  /unknown Firefox build target/
);
expectFailure(
  'warning path escape',
  () => canonicalFirefoxBuildWarning(warning({ id: '/tmp/foreign.js' }), rootDir),
  /escapes the repository/
);

handler(
  'warn',
  {
    plugin: 'builtin:vite-reporter',
    message: '\n(!) Some chunks are larger than 500 kB after minification. Consider:\n- split them',
  },
  () => {}
);
assertions += 1;
expectFailure(
  'forged reporter warning',
  () => handler('warn', { plugin: 'builtin:vite-reporter', message: 'unrelated reporter warning' }, () => {}),
  /unreviewed popup warning/
);

handler(
  'warn',
  {
    code: 'PLUGIN_TIMINGS',
    message: '[PLUGIN_TIMINGS] Your build spent significant time in plugins. Here is a breakdown:\n- vite:css (60%)',
  },
  () => {}
);
assertions += 1;
expectFailure(
  'plugin timing summary drift',
  () =>
    handler(
      'warn',
      {
        code: 'PLUGIN_TIMINGS',
        message: '[PLUGIN_TIMINGS] Your build spent significant time in plugins. Here is a breakdown: forged',
      },
      () => {}
    ),
  /unreviewed popup warning/
);

const packageInfo =
  "export const packageInfo = { name: '@polkadot/util', path: (import.meta && import.meta.url) ? new URL(import.meta.url).pathname.substring(0, new URL(import.meta.url).pathname.lastIndexOf('/') + 1) : 'auto', type: 'esm' };";
const normalized = normalizePolkadotPackageInfoForIife(
  packageInfo,
  `${rootDir}/node_modules/@polkadot/util/packageInfo.js`
);
assert.ok(normalized);
assert.equal(normalized.code.includes('import.meta'), false);
assert.match(normalized.code, /path: 'auto'/);
assertions += 3;

assert.equal(normalizePolkadotPackageInfoForIife(packageInfo, `${rootDir}/src/packageInfo.js`), null);
assertions += 1;
expectFailure(
  'unexpected package metadata expression',
  () =>
    normalizePolkadotPackageInfoForIife(
      'export const packageInfo = { path: import.meta.url };',
      `${rootDir}/node_modules/@polkadot/util/packageInfo.js`
    ),
  /unexpected import.meta usage/
);
expectFailure(
  'multiple metadata expressions',
  () =>
    normalizePolkadotPackageInfoForIife(
      `${packageInfo}\n${packageInfo}`,
      `${rootDir}/node_modules/@polkadot/util/packageInfo.js`
    ),
  /unexpected import.meta usage/
);

const loggerOutput = [];
const logPolicy = createFirefoxBuildLogPolicy({
  buildTarget: 'popup',
  rootDir,
  baseLogger: {
    warn: (message) => loggerOutput.push(message),
    warnOnce: (message) => loggerOutput.push(message),
  },
});
logPolicy.onLog('warn', warning(), (_level, log) => logPolicy.logger.warn(log.message));
assert.equal(loggerOutput.length, 1);
assertions += 1;
expectFailure(
  'Vite warning bypassing Rolldown review',
  () => logPolicy.logger.warn('[plugin vite-resolve] Module "child_process" was externalized'),
  /unreviewed popup Vite warning/
);
expectFailure(
  'reviewed warning replay',
  () => logPolicy.logger.warn(warning().message),
  /unreviewed popup Vite warning/
);

console.log(`[firefox-build-warning-policy-test] all ${assertions} adversarial assertions passed`);
