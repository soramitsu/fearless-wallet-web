#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { packageExtension } from './package-extension.mjs';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-extension-package-test-'));

try {
  const sourceDir = path.join(tempRoot, 'extension');
  const firstOutput = path.join(sourceDir, 'first.zip');
  const secondOutput = path.join(sourceDir, 'second.zip');
  const staleOutput = path.join(sourceDir, 'release.zip');
  await fs.mkdir(path.join(sourceDir, 'nested'), { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'manifest.json'), '{"manifest_version":3}\n');
  await fs.writeFile(path.join(sourceDir, 'nested', 'unicode-テスト.txt'), 'deterministic\n');

  const first = await packageExtension({ outputPath: firstOutput, sourceDir });
  const firstBytes = await fs.readFile(firstOutput);
  const oldDate = new Date('2024-01-01T01:02:03.000Z');
  const newDate = new Date('2026-08-23T22:35:30.000Z');
  await fs.utimes(path.join(sourceDir, 'manifest.json'), oldDate, oldDate);
  await fs.utimes(path.join(sourceDir, 'nested', 'unicode-テスト.txt'), newDate, newDate);
  await fs.rm(firstOutput);
  const second = await packageExtension({ outputPath: secondOutput, sourceDir });

  assert.equal(first.fileCount, 2);
  assert.equal(second.fileCount, 2);
  assert.equal(first.sha256, second.sha256, 'file timestamps or output name changed the package bytes');
  assert.deepEqual(await fs.readFile(secondOutput), firstBytes);

  await fs.writeFile(`${staleOutput}.tmp-999`, 'partial archive');
  await assert.rejects(
    packageExtension({ outputPath: staleOutput, sourceDir }),
    /stale temporary output/u,
    'a crashed package attempt must not be included in the next archive'
  );
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true });
}

console.log('Deterministic extension package self-test passed');
