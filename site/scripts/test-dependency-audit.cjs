const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { auditArguments } = require('./audit-dependencies.cjs');
const read = path => readFileSync(resolve(__dirname, '..', path));
const manifest = JSON.parse(read('package.json'));
const lock = read('yarn.lock').toString();

test('audit exceptions are restricted to the two proven backports', () => {
  const args = auditArguments(manifest, lock, read, false);
  assert.deepEqual(args.slice(-4), ['--ignore', '1240992', '--ignore', '1240912']);
  assert.equal(args.filter(arg => arg === '--ignore').length, 2);
  assert.ok(auditArguments(manifest, lock, read, true).includes('production'));
});

test('missing or changed selection, lock, and patch content fail closed', () => {
  assert.throws(() => auditArguments({}, lock, read, false), /proof failed/);
  assert.throws(() => auditArguments(manifest, '', read, false), /proof failed/);
  assert.throws(() => auditArguments(manifest, lock, () => Buffer.from('tampered'), false), /proof failed/);
  const changed = structuredClone(manifest);
  changed.resolutions.braces = '3.0.3';
  assert.throws(() => auditArguments(changed, lock, read, false), /proof failed/);
});
