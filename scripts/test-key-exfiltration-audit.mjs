import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertNoKnownKeyExfiltration, auditKeyExfiltrationDirectory } from './audit-key-exfiltration.mjs';

const indicators = [
  'service.fetchJettonInfo()',
  'service.getDataAccounts({ address })',
  '"https://tonscanner.org"',
  '`${base}/eth-enabled/appConfigs/web_config.json`',
  '`${remote}/whitelist?address=${payload}`',
  'CryptoJS.AES.encrypt(value, "").toString()',
  "e.AES.encrypt(t,'').toString()",
];

for (const source of indicators) {
  test(`rejects known incident code: ${source}`, () => {
    assert.throws(
      () => assertNoKnownKeyExfiltration(new Map([['background.js', Buffer.from(source)]])),
      /known key-exfiltration indicator/u
    );
  });
}

test('allows password-protected backups and ordinary public token requests', () => {
  const source = `CryptoJS.AES.encrypt(mnemonic, password);
    axios.get('/accounts/' + publicAddress + '/jettons');
    const exposureMarker = 'myAddresses';`;
  assert.equal(assertNoKnownKeyExfiltration(new Map([['background.js', Buffer.from(source)]])), 1);
});

test('requires runtime files and keeps sensitive file contents out of diagnostics', () => {
  assert.throws(() => assertNoKnownKeyExfiltration(new Map()), /no runtime files/u);
  assert.throws(
    () => assertNoKnownKeyExfiltration(new Map([['chunk.js', Buffer.from('fetchJettonInfo("dummy-secret")')]])),
    (error) => /chunk\.js/u.test(error.message) && !error.message.includes('dummy-secret')
  );
});

test('checks nested chunks and refuses symlinks rather than skipping them', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-exfiltration-audit-'));
  try {
    await fs.mkdir(path.join(directory, 'chunks'));
    await fs.writeFile(path.join(directory, 'background.js'), 'export const ready = true;');
    assert.equal(await auditKeyExfiltrationDirectory(directory), 1);
    await fs.writeFile(path.join(directory, 'chunks/legacy.js'), indicators[0]);
    await assert.rejects(auditKeyExfiltrationDirectory(directory), /known key-exfiltration indicator/u);
    await fs.rm(path.join(directory, 'chunks/legacy.js'));
    await fs.symlink(path.join(directory, 'background.js'), path.join(directory, 'chunks/link.js'));
    await assert.rejects(auditKeyExfiltrationDirectory(directory), /refuses symbolic link/u);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
