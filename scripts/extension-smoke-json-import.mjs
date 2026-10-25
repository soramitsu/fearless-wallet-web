import { Buffer } from 'node:buffer';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, isEthereumAddress, base64Decode } from '@polkadot/util-crypto';
import { entropyToMnemonic } from '@polkadot/util-crypto/mnemonic/bip39';
import { u8aToHex } from '@polkadot/util';
import { decodePair } from '@subwallet/keyring/pair/decode';

// Only public unfunded fixtures in a disposable offline Chrome profile.
const phrase = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
export async function checkJsonImportStorage({ send, read, remove, restart, password, assert, eventually, inspectUI }) {
  await cryptoWaitReady();
  const backend = new Keyring();
  const rows = [];
  for (const [type, path] of [['sr25519', ''], ['ed25519', ''], ['ecdsa', ''], ['ethereum', ''], ['sr25519', '//custom']]) {
    const expected = backend.createFromUri(phrase + path, {}, type);
    const address = await send('pri(accounts.create)', { suri: phrase + path, type,
      walletEcosystem: 'substrate', meta: { name: `Public JSON ${type}${path}` } });
    assert(address === expected.address, `${type}${path} fixture address mismatch`);
    const key = `fw:account:${isEthereumAddress(address) ? address.toLowerCase() : u8aToHex(expected.publicKey)}`;
    const file = await read(key);
    assert(file?.encoded, 'Backup fixture was not stored');
    rows.push({ type, path, address, key, file });
  }
  // Model off-device backups by removing only these public fixture records, then restarting.
  // This bypasses application deletion deliberately; it is not a deletion qualification.
  await remove(rows.map(({ key }) => key));
  await restart();
  assert(await send('pri(keyring.unlock)', { password }), 'Fixture wallet did not reopen');
  for (const row of rows) {
    assert(await read(row.key) === undefined, 'Fixture removal was not durable');
    row.request = { file: row.file, password };
    assert(await send('pri(accounts.json.restore)', row.request) === row.address, `${row.type} JSON address mismatch`);
    row.committed = await read(row.key);
    assert(row.committed?.meta.isMasterPassword, 'Restored encrypted record missing');
    assert(row.committed.meta.universalWallet.source === 'legacy-import', 'JSON provenance was lost');
    const duplicated = await Promise.all([send('pri(accounts.json.restore)', row.request), send('pri(accounts.json.restore)', row.request)]);
    assert(duplicated.every((address) => address === row.address), 'JSON duplicate identity mismatch');
    assert(JSON.stringify(await read(row.key)) === JSON.stringify(row.committed), 'JSON duplicate changed stored recovery material');
    if (row.path) {
      assert(row.committed.meta.isMnemonicUnverified && !row.committed.meta.isMasterAccount, 'Custom-path JSON was promoted to an unverified mnemonic root');
      let rejected = false;
      try { await send('pri(keyring.export.mnemonic)', { address: row.address, password }); } catch { rejected = true; }
      assert(rejected, 'Unverified mnemonic export succeeded');
    } else {
      const result = await send('pri(keyring.export.mnemonic)', { address: row.address, password });
      assert(result.seed === phrase, 'JSON recovery phrase changed');
    }
  }
  const forged = JSON.parse(JSON.stringify(rows[0].file));
  forged.address = rows[4].file.address;
  let forgedRejected = false;
  try { await send('pri(accounts.json.restore)', { file: forged, password }); } catch { forgedRejected = true; }
  assert(forgedRejected, 'Mismatched JSON header was accepted');
  assert(await send('pri(keyring.unlock)', { password }), 'Enrollment unlock failed');
  for (const row of rows.filter(({ type, path }) => type !== 'ecdsa' && !path)) {
    row.committed = await eventually(async () => {
      const saved = await read(row.key);
      assert(['bitcoinAddress', 'bitcoinTestnetAddress', 'solanaAddress', 'tonAddress', 'irohaPublicKeyHex']
        .every((field) => saved.meta[field]), 'Verified JSON optional network enrollment pending');
      return saved;
    }, `${row.type} JSON network enrollment`);
  }
  const nextPassword = password + '-json-rotation';
  assert(await send('pri(keyring.changePassword)', { oldPassword: password, newPassword: nextPassword }), 'JSON password rotation failed');
  for (const row of rows) row.rotated = await read(row.key);
  await restart();
  assert(await send('pri(keyring.unlock)', { password: nextPassword }), 'Restored JSON wallet did not reopen');
  for (const row of rows) {
    assert(JSON.stringify(await read(row.key)) === JSON.stringify(row.rotated), 'JSON record changed across restart');
    const restored = backend.createFromJson(row.rotated);
    restored.decodePkcs8(nextPassword);
    const payload = Uint8Array.from(Buffer.from('Public compiled JSON recovery proof'));
    assert(restored.verify(payload, restored.sign(payload), restored.publicKey), 'Restarted JSON signing key failed verification');
    const decoded = decodePair(nextPassword, base64Decode(row.rotated.encoded), row.rotated.encoding.type);
    try { assert(entropyToMnemonic(decoded.entropy) === phrase, 'Restart lost original encrypted entropy'); }
    finally { decoded.secretKey.fill(0); decoded.entropy?.fill(0); restored.lock(); }
    if (row.path) {
      assert(row.rotated.meta.isMnemonicUnverified && !row.rotated.meta.bitcoinAddress, 'Unverified JSON acquired network authority');
      let rejected = false;
      try { await send('pri(keyring.export.mnemonic)', { address: row.address, password: nextPassword }); } catch { rejected = true; }
      assert(rejected, 'Restart enabled unverified mnemonic export');
    } else {
      assert((await send('pri(keyring.export.mnemonic)', { address: row.address, password: nextPassword })).seed === phrase, 'Restart lost verified JSON phrase');
    }
  }
  const notices = await inspectUI({ address: rows.find(({ path }) => path).address, password: nextPassword });
  assert(await send('pri(keyring.lock)', true), 'JSON wallet did not lock');
  for (const row of rows) {
    let rejected = false;
    try { await send('pri(accounts.json.restore)', row.request); } catch { rejected = true; }
    assert(rejected, 'Locked JSON import succeeded');
    assert(JSON.stringify(await read(row.key)) === JSON.stringify(row.rotated), 'Locked JSON import changed recovery material');
  }
  return { notices, accounts: rows.map(({ type, path, address }) => ({ type, path, address })), durableRestore: true,
    duplicatePreserved: true, forgedHeaderRejected: true, verifiedExport: true, primaryOnlyCustomPath: true,
    preservedEncryptedEntropy: true, passwordRotation: true, workerRestart: true, lockedRejected: true };
}
