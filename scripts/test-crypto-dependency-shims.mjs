import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const yarnLock = await readFile(path.join(root, 'yarn.lock'), 'utf8');

const expectedResolutions = Object.freeze({
  'bip322-js@npm:^2.0.0': 'file:./vendor/bip322-js',
  'bitcoinjs-message@npm:^2.2.0': 'file:./vendor/bitcoinjs-message',
  'browserify-sign@npm:^4.2.3': 'file:./vendor/browserify-sign',
  'create-ecdh@npm:^4.0.4': 'file:./vendor/create-ecdh',
});

assert.deepEqual(
  Object.fromEntries(Object.keys(expectedResolutions).map((key) => [key, packageJson.resolutions?.[key]])),
  expectedResolutions,
  'crypto compatibility resolutions must stay exact',
);
assert.equal(yarnLock.includes('elliptic@npm'), false, 'the lockfile must not resolve vulnerable elliptic packages');
assert.equal(yarnLock.includes('bip322-js@patch:'), false, 'the lockfile must use the dependency-free local shim');

for (const [name, version] of [
  ['bip322-js', '2.0.0'],
  ['bitcoinjs-message', '2.2.0'],
  ['browserify-sign', '4.2.6'],
  ['create-ecdh', '4.0.4'],
]) {
  const manifest = JSON.parse(await readFile(path.join(root, 'vendor', name, 'package.json'), 'utf8'));
  assert.equal(manifest.name, name, `${name} shim name drifted`);
  assert.equal(manifest.version, version, `${name} shim version drifted`);
  assert.equal(manifest.private, true, `${name} shim must never be published`);
  assert.deepEqual(manifest.dependencies ?? {}, {}, `${name} shim must remain dependency-free`);
}

function expectDisabled(operation, label) {
  assert.throws(operation, /disabled|fail closed/i, `${label} must fail closed`);
}

const bip322 = require('bip322-js');
expectDisabled(() => bip322.Signer.sign('wif', 'address', 'message'), 'BIP-322 signer');

const bitcoinMessage = require('bitcoinjs-message');
expectDisabled(() => bitcoinMessage.magicHash('message'), 'legacy Bitcoin message hash');
expectDisabled(() => bitcoinMessage.sign('message', new Uint8Array(32), true), 'legacy Bitcoin message signer');
expectDisabled(() => bitcoinMessage.verify('message', 'address', 'signature'), 'legacy Bitcoin message verifier');

const browserifySign = require('browserify-sign');
expectDisabled(() => browserifySign.createSign('sha256'), 'generic browser createSign');
expectDisabled(() => browserifySign.createVerify('sha256'), 'generic browser createVerify');
const algorithms = require('browserify-sign/algos');
assert.deepEqual(algorithms, {}, 'generic browser signing algorithms must not be advertised');
assert.equal(Object.isFrozen(algorithms), true, 'generic browser signing algorithms must stay immutable');

const createECDH = require('create-ecdh');
expectDisabled(() => createECDH('secp256k1'), 'generic browser createECDH');

const cryptoBrowserify = require('crypto-browserify');
assert.equal(
  cryptoBrowserify.createHash('sha256').update('fearless').digest('hex'),
  '3b9c2144ccfa84fcb90406914c128f88f7bd23cd42161c591ec6fb9258e8d8a2',
  'non-signing crypto-browserify hash compatibility must remain intact',
);
expectDisabled(() => cryptoBrowserify.createSign('sha256'), 'crypto-browserify createSign');
expectDisabled(() => cryptoBrowserify.createECDH('secp256k1'), 'crypto-browserify createECDH');

console.log('[crypto-dependency-shims-test] all fail-closed checks passed');
