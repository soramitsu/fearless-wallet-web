import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, isEthereumAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

// Public unfunded phrase; offline compiled worker and real Chrome storage/reload only.
const phrase = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';

export async function checkLocalImportStorage({ send, read, restart, password, assert, eventually }) {
  await cryptoWaitReady();
  const expectedKeys = new Keyring();
  const rows = [];
  for (const type of ['sr25519', 'ed25519', 'ecdsa', 'ethereum']) {
    const expected = expectedKeys.createFromUri(phrase, {}, type);
    const key = `fw:account:${isEthereumAddress(expected.address) ? expected.address.toLowerCase() : u8aToHex(expected.publicKey)}`;
    const request = { suri: phrase, type, walletEcosystem: 'substrate', meta: { name: `Public durable ${type}` } };
    const address = await send('pri(accounts.create)', request);
    assert(address === expected.address, `${type} import address mismatch`);
    const committed = await read(key);
    assert(committed?.encoded && committed.meta.isMasterPassword, `${type} encrypted record missing`);
    const duplicated = await Promise.all([
      send('pri(accounts.create)', { ...request, meta: { name: 'Duplicate one' } }),
      send('pri(accounts.create)', { ...request, meta: { name: 'Duplicate two' } }),
    ]);
    assert(duplicated.every((value) => value === address), `${type} duplicate address mismatch`);
    assert(JSON.stringify(await read(key)) === JSON.stringify(committed), `${type} duplicate replaced a durable record`);
    const exported = await send('pri(keyring.export.mnemonic)', { address, password, walletEcosystem: 'substrate' });
    assert(exported.seed === phrase, `${type} imported phrase did not reopen`);
    rows.push({ type, address, key, request, committed });
  }
  // These raw creation messages omit the UI's derived network metadata. Let the existing
  // unlock-time enrollment finish before comparing an exact restart snapshot.
  assert(await send('pri(keyring.unlock)', { password }), 'Enrollment unlock failed');
  for (const row of rows.filter(({ type }) => type !== 'ecdsa')) {
    row.committed = await eventually(async () => {
      const saved = await read(row.key);
      assert(['bitcoinAddress', 'bitcoinTestnetAddress', 'solanaAddress', 'tonAddress', 'irohaPublicKeyHex']
        .every((field) => saved.meta[field]), `${row.type} optional network enrollment is pending`);
      return saved;
    }, `${row.type} optional network enrollment`);
  }
  const nextPassword = `${password}-local-rotation`;
  assert(await send('pri(keyring.changePassword)', { oldPassword: password, newPassword: nextPassword }), 'Local password rotation failed');
  for (const row of rows) {
    row.rotated = await read(row.key);
    assert(row.rotated.encoded !== row.committed.encoded, `${row.type} was not re-encrypted`);
  }
  await restart();
  assert(await send('pri(keyring.unlock)', { password: nextPassword }), 'Restarted local wallet did not unlock');
  for (const row of rows) {
    const exported = await send('pri(keyring.export.mnemonic)', { address: row.address, password: nextPassword, walletEcosystem: 'substrate' });
    assert(exported.seed === phrase, `${row.type} restart lost the phrase`);
    assert(JSON.stringify(await read(row.key)) === JSON.stringify(row.rotated), `${row.type} restart changed the durable record`);
  }
  assert(await send('pri(keyring.lock)', true), 'Local wallet did not lock');
  for (const row of rows) {
    let rejected = false;
    try { await send('pri(accounts.create)', row.request); } catch { rejected = true; }
    assert(rejected, `${row.type} locked import reported success`);
    assert(JSON.stringify(await read(row.key)) === JSON.stringify(row.rotated), `${row.type} locked import changed the record`);
  }
  return { types: rows.map(({ type, address }) => ({ type, address })), durableCreate: true, duplicatePreserved: true,
    verifiedExport: true, metadataEnrollmentCompleted: true, passwordRotation: true, workerRestart: true, lockedRejected: true };
}
