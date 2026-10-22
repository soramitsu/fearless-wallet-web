#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createFirefoxWarningBaseline,
  verifyFirefoxWarningBaseline,
} from './firefox-webext-warning-policy.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = await realpath(path.join(scriptDirectory, '..'));
const sourceDirLabel = 'dist/extension/firefox';
const sourceDir = path.join(repositoryRoot, sourceDirLabel);
const baselineFile = path.join(repositoryRoot, 'config/firefox-webext-warning-baseline.json');
const shouldPrintBaseline = process.argv.length === 3 && process.argv[2] === '--print-baseline';

if (process.argv.length > (shouldPrintBaseline ? 3 : 2)) {
  throw new Error('usage: audit-firefox-webext-warnings.mjs [--print-baseline]');
}

const require = createRequire(import.meta.url);
const webExtEntry = require.resolve('web-ext');
const webExtRoot = path.dirname(webExtEntry);
const webExtPackage = JSON.parse(await readFile(path.join(webExtRoot, 'package.json'), 'utf8'));
const webExtCli = path.join(webExtRoot, webExtPackage.bin['web-ext']);

const childEnvironment = { ...process.env };
for (const key of Object.keys(childEnvironment)) {
  if (key.startsWith('WEB_EXT_') || ['NODE_OPTIONS', 'NODE_PATH'].includes(key)) {
    delete childEnvironment[key];
  }
}
childEnvironment.HOME = '/var/empty';
childEnvironment.XDG_CONFIG_HOME = '/var/empty';

const lint = spawnSync(
  process.execPath,
  [
    webExtCli,
    '--no-config-discovery',
    'lint',
    '--source-dir',
    sourceDir,
    '--output=json',
  ],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: childEnvironment,
    maxBuffer: 16 * 1_024 * 1_024,
    timeout: 120_000,
  },
);

if (lint.error) {
  throw new Error(`web-ext lint failed to execute: ${lint.error.message}`);
}
if (lint.signal) {
  throw new Error(`web-ext lint terminated by signal ${lint.signal}`);
}
if (lint.status !== 0) {
  const preview = `${lint.stderr ?? ''}`.replace(/[\0\r\n]+/g, ' ').slice(0, 500);
  throw new Error(`web-ext lint exited ${lint.status}: ${preview || '<no diagnostics>'}`);
}

let lintResult;
try {
  lintResult = JSON.parse(lint.stdout);
} catch {
  throw new Error('web-ext lint did not return one valid JSON document');
}

if (shouldPrintBaseline) {
  const baseline = await createFirefoxWarningBaseline({
    lintResult,
    sourceDir,
    sourceDirLabel,
    webExtVersion: webExtPackage.version,
  });
  process.stdout.write(`${JSON.stringify(baseline, null, 2)}\n`);
} else {
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
  const result = await verifyFirefoxWarningBaseline({
    baseline,
    lintResult,
    sourceDir,
    sourceDirLabel,
    webExtVersion: webExtPackage.version,
  });
  console.log(
    `[firefox-webext-warning-audit] exact reviewed baseline passed: ${result.warningCount} warnings, ${result.warningSetSha256}`,
  );
}
