import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const forge = require('node-forge');
let checks = 0;
function check(name, action) {
  action();
  checks++;
  console.log(`PASS ${name}`);
}

// Verify executable installed sources against the reviewed vendor copy.
for (const name of ['node-forge']) {
  const installed = path.dirname(require.resolve(`${name}/package.json`));
  const vendored = path.join(root, 'vendor', name);
  function compare(directory = '') {
    for (const entry of readdirSync(path.join(vendored, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) compare(relative);
      else if (/\.(?:c?js|json)$/.test(entry.name)) {
        check(`${name} installed source ${relative}`, () => assert.deepEqual(
          readFileSync(path.join(installed, relative)), readFileSync(path.join(vendored, relative)),
        ));
      }
    }
  }
  compare();
}

const disabled = /Android ADB cryptography is disabled/;
for (const [name, operation] of Object.entries({
  integer: () => new forge.jsbn.BigInteger('01', 16),
  rsaPublicKey: () => forge.pki.rsa.setPublicKey({}, {}),
  rsaKeyGeneration: () => forge.pki.rsa.generateKeyPair(),
  publicPem: () => forge.pki.publicKeyFromPem(''),
  privatePem: () => forge.pki.privateKeyFromPem(''),
  decryptPem: () => forge.pki.decryptRsaPrivateKey('', ''),
  md5: () => forge.md.md5.create(),
})) check(`ADB ${name} fails closed`, () => assert.throws(operation, disabled));
check('ADB module still loads for desktop web-ext', () => assert.equal(typeof require('@devicefarmer/adbkit').default.createClient, 'function'));
check('real ADB public key parser cannot reach RSA verification', () => {
  const struct = Buffer.alloc(524);
  struct.writeUInt32LE(64, 0);
  struct.writeUInt32LE(65537, 520);
  assert.throws(() => require('@devicefarmer/adbkit/dist/src/adb/auth').default.readPublicKeyFromStruct(struct, 'test'), disabled);
});

console.log(`Development dependency guards passed (${checks} checks).`);
