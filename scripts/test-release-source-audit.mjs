#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit-release-source.mjs');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-release-source-audit-'));

function git(...args) {
  return execFileSync('git', ['-C', tempRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function runAudit(...args) {
  return spawnSync(process.execPath, [scriptPath, '--root', tempRoot, ...args], { encoding: 'utf8' });
}

try {
  git('init', '--quiet');
  git('config', 'user.email', 'release-audit@example.invalid');
  git('config', 'user.name', 'Release Audit');
  await fs.writeFile(path.join(tempRoot, 'package.json'), '{"version":"3.0.6"}\n');
  await fs.writeFile(path.join(tempRoot, 'tracked.txt'), 'reviewed\n');
  git('add', 'package.json', 'tracked.txt');
  git('commit', '--quiet', '-m', 'fixture');

  const clean = runAudit();
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /Release source audit passed/u);

  await fs.appendFile(path.join(tempRoot, 'tracked.txt'), 'dirty\n');
  const modified = runAudit();
  assert.notEqual(modified.status, 0);
  assert.match(modified.stderr, /clean Git checkout/u);
  git('checkout', '--quiet', '--', 'tracked.txt');

  await fs.writeFile(path.join(tempRoot, 'untracked.txt'), 'unreviewed\n');
  const untracked = runAudit();
  assert.notEqual(untracked.status, 0);
  assert.match(untracked.stderr, /untracked\.txt/u);
  await fs.rm(path.join(tempRoot, 'untracked.txt'));

  const missingTag = runAudit('--require-tag');
  assert.notEqual(missingTag.status, 0);
  assert.match(missingTag.stderr, /not tagged 3\.0\.6/u);
  git('tag', '3.0.6');

  const tagged = runAudit('--require-tag');
  assert.equal(tagged.status, 0, tagged.stderr);
  assert.match(tagged.stdout, /tag 3\.0\.6/u);
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true });
}

console.log('Release source audit self-test passed (5 checks)');
