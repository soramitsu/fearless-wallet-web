#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const fixturePaths = [
  'fearless-wallet-web/docs/universal-wallet-v2-vectors.json',
  'fearless-iOS/docs/universal-wallet-v2-vectors.json',
  'fearless-Android/common/src/test/resources/universal-wallet-v2-vectors.json',
];

/** Checks fixture identity, not cryptography; each client runs its own restore tests. */
export function verifyUniversalWalletVectors(workspaceRoot) {
  const fixtures = fixturePaths.map((path) => readFileSync(resolve(workspaceRoot, path)));
  const expected = fixtures[0];
  for (let index = 1; index < fixtures.length; index += 1) {
    assert(fixtures[index].equals(expected), `${fixturePaths[index]} differs from the web reference fixture`);
  }
  const fixture = JSON.parse(expected.toString('utf8'));
  assert.equal(fixture.version, 1, 'Unsupported address vector version');
  assert.deepEqual(fixture.vectors.map(({ id, wordCount }) => [id, wordCount]), [
    ['import12', 12], ['default24', 24],
  ], 'Both the 12-word import and 24-word default vectors are required');
  for (const vector of fixture.vectors) {
    assert.deepEqual(Object.keys(vector.expected).sort(), ['bitcoin', 'evm', 'iroha', 'solana', 'substrate', 'ton']);
    assert.deepEqual(Object.keys(vector.expected.iroha).sort(), ['derivationPath', 'nexus', 'taira']);
  }
  return { sha256: createHash('sha256').update(expected).digest('hex'), clients: fixtures.length, vectors: fixture.vectors.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const result = verifyUniversalWalletVectors(root);
    console.log(`PASS: ${result.clients} clients share ${result.vectors} address vectors (SHA-256 ${result.sha256})`);
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
