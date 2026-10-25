import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditSoraDependencyRemoval, soraDependencyGuard } from './audit-sora-dependency-removal.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sora-removal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'src/index.ts'), 'export const value = 1;');
  return root;
}
test('accepts independent source', (t) => assert.doesNotThrow(() => auditSoraDependencyRemoval(fixture(t))));
for (const file of ['package.json', 'yarn.lock', 'pnpm-lock.yaml', 'package-lock.json', '.yarnrc.yml', 'src/index.ts']) {
  test(`rejects removed package in ${file}`, (t) => {
    const root = fixture(t);
    fs.writeFileSync(path.join(root, file), '@sora-substrate/sdk');
    assert.throws(() => auditSoraDependencyRemoval(root), /Removed SORA dependency/);
  });
}
test('rejects hosted repository URL', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'src/index.ts'), 'https://raw.githubusercontent.com/sora-xor/sora2-substrate-js-library/master/types.json');
  assert.throws(() => auditSoraDependencyRemoval(root), /Removed SORA dependency/);
});
test('rejects installed residue', (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'node_modules/@sora-substrate/sdk'), { recursive: true });
  assert.throws(() => auditSoraDependencyRemoval(root), /remain installed/);
});
test('bundler rejects module resolution', () => {
  assert.throws(() => soraDependencyGuard('.').resolveId('@sora-substrate/math'), /cannot be bundled/);
});
