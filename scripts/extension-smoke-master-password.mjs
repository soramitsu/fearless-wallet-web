import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, isEthereumAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

const phrase = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';

// Public unfunded fixtures only. Injection replaces the worker's storage API,
// not application handlers; normal commits/reloads use actual Chrome storage.
export async function checkMasterPasswordStorage({ send, read, restart, password, assert, eventually, storageFault }) {
  await cryptoWaitReady();
  const keyring = new Keyring();
  const rows = [];
  for (const type of ['sr25519', 'ed25519', 'ecdsa', 'ethereum']) {
    const expected = keyring.createFromUri(phrase, {}, type);
    const key = `fw:account:${isEthereumAddress(expected.address) ? expected.address.toLowerCase() : u8aToHex(expected.publicKey)}`;
    const address = await send('pri(accounts.create)', { suri: phrase, type, walletEcosystem: 'substrate', meta: { name: `Public password ${type}` } });
    assert(address === expected.address, `${type} identity mismatch`);
    rows.push({ type, address, key });
  }
  const ton = await send('pri(accounts.create)', { suri: phrase, type: 'sr25519', walletEcosystem: 'ton', meta: { name: 'Public password TON' } });
  assert(await send('pri(keyring.unlock)', { password }), 'Enrollment unlock failed');
  for (const row of rows.filter(({ type }) => type !== 'ecdsa'))
    await eventually(async () => {
      const saved = await read(row.key);
      return ['bitcoinAddress', 'bitcoinTestnetAddress', 'solanaAddress', 'tonAddress', 'irohaPublicKeyHex'].every(field => saved?.meta[field]);
    }, `${row.type} enrollment`);
  const keys = ['fw:keyring', ...rows.map(({ key }) => key), `fw:ton:${ton}`];
  const snapshot = async () => Object.fromEntries(await Promise.all(keys.map(async key => [key, await read(key)])));
  const before = await snapshot();
  const next = `${password}-atomic-rotation`;
  let heldResult;
  try {
    await storageFault('fail');
    assert(!await send('pri(keyring.changePassword)', { oldPassword: password, newPassword: next }), 'Failed storage reported password success');
    assert(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Failed commit changed password or ciphertext');
    const failed = await storageFault('inspect');
    assert(failed.calls.some(call => keys.every(key => call.includes(key))), 'Password/native/TON were not submitted together');
    await storageFault('hold');
    heldResult = send('pri(keyring.changePassword)', { oldPassword: password, newPassword: next });
    await eventually(async () => (await storageFault('inspect')).pending === 1, 'Held password storage submission');
    assert(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Held commit published durable data early');
    assert(await send('pri(keyring.lock)', true), 'Lock during submitted change failed');
    await storageFault('release');
    assert(!await heldResult, 'Password completion after lock reported success');
    assert(await send('pri(keyring.keyringIsLocked)', null), 'Submitted password change unlocked a locked wallet');
    assert(await send('pri(keyring.unlock)', { password: next }), 'Committed new password cannot unlock');
  } finally {
    await storageFault('restore');
  }
  const after = await snapshot();
  assert(after['fw:keyring'].passwordHash !== before['fw:keyring'].passwordHash, 'Password hash was not rotated');
  for (const row of rows) {
    assert(after[row.key].encoded !== before[row.key].encoded, `${row.type} ciphertext did not rotate`);
    assert(JSON.stringify(after[row.key].meta) === JSON.stringify(before[row.key].meta), `${row.type} metadata changed`);
    const restored = keyring.createFromJson(after[row.key]);
    restored.decodePkcs8(next);
    const expected = keyring.createFromUri(phrase, {}, row.type);
    assert(u8aToHex(restored.publicKey) === u8aToHex(expected.publicKey), `${row.type} key changed`);
  }
  const exportAll = async activePassword => {
    for (const row of rows) assert((await send('pri(keyring.export.mnemonic)', { address: row.address, password: activePassword, walletEcosystem: 'substrate' })).seed === phrase, `${row.type} phrase failed after rotation`);
    assert((await send('pri(keyring.export.mnemonic)', { address: ton, password: activePassword, walletEcosystem: 'ton' })).seed === phrase, 'TON phrase failed after rotation');
  };
  await exportAll(next);
  await restart();
  assert(!await send('pri(keyring.unlock)', { password }), 'Old password remained active after restart');
  assert(await send('pri(keyring.unlock)', { password: next }), 'New password lost after restart');
  await exportAll(next);
  const last = `${password}-second-rotation`;
  assert(await send('pri(keyring.changePassword)', { oldPassword: next, newPassword: last }), 'Uninterrupted password rotation failed');
  await restart();
  assert(await send('pri(keyring.unlock)', { password: last }), 'Second password lost after restart');
  await exportAll(last);
  return { types: rows.map(({ type, address }) => ({ type, address })), groupedPasswordNativeTonSubmission: true,
    rejectedWriteLeavesExactRecords: true, heldWriteLeavesExactRecords: true, lateLockRejectsSuccessAndStaysLocked: true,
    committedPasswordReopensEveryKey: true, uninterruptedRetry: true, twoObservedWorkerRestarts: true,
    publicUnfundedFixturesOnly: true, faultScope: 'Synchronous storage API rejection and held submission, not actual Chrome disk exhaustion' };
}
