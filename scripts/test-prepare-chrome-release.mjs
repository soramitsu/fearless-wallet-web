#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createCommandEnvironment, spawnYarn } from './prepare-chrome-release.mjs';

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-prepare-release-test-'));

try {
  const shellWrapper = path.join(temporaryDirectory, 'yarn');
  await fs.writeFile(shellWrapper, '#!/bin/sh\nprintf "wrapper:%s\\n" "$1"\n');
  await fs.chmod(shellWrapper, 0o755);

  const wrapperResult = spawnYarn(shellWrapper, ['--version'], { encoding: 'utf8' });
  assert.equal(wrapperResult.status, 0);
  assert.equal(wrapperResult.stdout.trim(), 'wrapper:--version');

  const JavaScriptEntrypoint = path.join(temporaryDirectory, 'yarn.mjs');
  await fs.writeFile(JavaScriptEntrypoint, 'console.log(`javascript:${process.argv[2]}`);\n');

  const JavaScriptResult = spawnYarn(JavaScriptEntrypoint, ['--version'], { encoding: 'utf8' });
  assert.equal(JavaScriptResult.status, 0);
  assert.equal(JavaScriptResult.stdout.trim(), 'javascript:--version');

  const originalNodeEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const testEnvironment = createCommandEnvironment({ NODE_ENV: 'test' });
  assert.equal(testEnvironment.NODE_ENV, 'test');
  assert.equal(process.env.NODE_ENV, 'production');
  if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnvironment;

  console.log('Chrome release preparation runner self-test passed (4 checks)');
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
