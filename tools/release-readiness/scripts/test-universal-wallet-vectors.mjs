import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fixturePaths, verifyUniversalWalletVectors } from './verify-universal-wallet-vectors.mjs';

// Synthetic schema fixtures keep this audit test runnable without app checkouts.
// Cryptographic expected values belong to each client's shared golden fixture.
function withFixtures(callback) {
  const root = mkdtempSync(resolve(tmpdir(), 'fearless-address-parity-'));
  const fixture = { version: 1, vectors: [12, 24].map((wordCount) => ({
    id: wordCount === 12 ? 'import12' : 'default24', wordCount,
    expected: { substrate: {}, evm: {}, bitcoin: {}, solana: {}, ton: {}, iroha: { derivationPath: '', taira: {}, nexus: {} } },
  })) };
  try {
    for (const path of fixturePaths) {
      mkdirSync(dirname(resolve(root, path)), { recursive: true });
      writeFileSync(resolve(root, path), JSON.stringify(fixture));
    }
    callback(root, fixture);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts identical fixtures and reports their digest', () => withFixtures((root) => {
  const result = verifyUniversalWalletVectors(root);
  assert.equal(result.clients, 3);
  assert.equal(result.vectors, 2);
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
}));

for (const path of fixturePaths) {
  test(`rejects fixture drift in ${path}`, () => withFixtures((root, fixture) => {
    fixture.vectors[0].expected.iroha.nexus.i105 = 'changed-address';
    writeFileSync(resolve(root, path), JSON.stringify(fixture));
    assert.throws(() => verifyUniversalWalletVectors(root), /differs/u);
  }));
}

test('rejects a missing client fixture', () => withFixtures((root) => {
  rmSync(resolve(root, fixturePaths[2]));
  assert.throws(() => verifyUniversalWalletVectors(root), /ENOENT/u);
}));

test('rejects three equally incomplete fixtures', () => withFixtures((root, fixture) => {
  fixture.vectors.pop();
  for (const path of fixturePaths) writeFileSync(resolve(root, path), JSON.stringify(fixture));
  assert.throws(() => verifyUniversalWalletVectors(root), /Both the 12-word/u);
}));

test('rejects omission of Nexus from every client', () => withFixtures((root, fixture) => {
  delete fixture.vectors[0].expected.iroha.nexus;
  for (const path of fixturePaths) writeFileSync(resolve(root, path), JSON.stringify(fixture));
  assert.throws(() => verifyUniversalWalletVectors(root), assert.AssertionError);
}));
