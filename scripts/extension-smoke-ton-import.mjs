// Public, unfunded vectors in a disposable Chrome profile. Exercises the compiled worker and real
// chrome.storage.local; quota/abort timing remains covered by the adapter tests.
export async function checkTonImportStorage({ send, read, restart, fixture, password, assert }) {
  const address = fixture.expected.ton.addressNonBounceable;
  const key = `fw:ton:${address}`;
  const request = {
    suri: fixture.mnemonic,
    type: 'ed25519',
    walletEcosystem: 'ton',
    meta: { name: 'Public durable TON import' },
    tonImport: { derivation: 'universal', address },
  };
  const imported = await send('pri(accounts.create)', request);
  assert(imported === address, 'TON import returned a different address');
  const committed = await read(key);
  assert(committed?.cipherSeed && committed.publicKeyHex === fixture.expected.ton.publicKeyHex, 'TON seed was not stored');
  const [first, second] = await Promise.all([
    send('pri(accounts.create)', { ...request, meta: { name: 'Duplicate one' } }),
    send('pri(accounts.create)', { ...request, meta: { name: 'Duplicate two' } }),
  ]);
  assert(first === address && second === address, 'Duplicate import did not retain the address');
  assert(JSON.stringify(await read(key)) === JSON.stringify(committed), 'Duplicate import replaced the durable record');
  const exported = await send('pri(keyring.export.mnemonic)', { address, password, walletEcosystem: 'ton' });
  assert(exported.seed === fixture.mnemonic, 'Imported TON phrase did not reopen');

  const nextPassword = `${password}-ton-rotation`;
  assert(await send('pri(keyring.changePassword)', { oldPassword: password, newPassword: nextPassword }), 'Password change failed');
  const rotated = await read(key);
  assert(rotated.cipherSeed !== committed.cipherSeed && !rotated.pendingCipherSeed, 'TON ciphertext was not committed under the new password');
  await restart();
  assert(await send('pri(keyring.unlock)', { password: nextPassword }), 'Restarted wallet did not unlock');
  const reopened = await send('pri(keyring.export.mnemonic)', { address, password: nextPassword, walletEcosystem: 'ton' });
  assert(reopened.seed === fixture.mnemonic, 'Restart lost the imported TON phrase');
  const accounts = await send('pri(accounts.subscribe)', null);
  assert(accounts.filter((account) => account.address === address).length === 1, 'Restart duplicated or lost the TON account');
  assert(await send('pri(keyring.lock)', true), 'Wallet did not lock');
  assert(await send('pri(keyring.keyringIsLocked)', null), 'Wallet remained unlocked');
  let lockedRejected = false;
  try { await send('pri(accounts.create)', request); } catch { lockedRejected = true; }
  assert(lockedRejected, 'Locked import reported success');
  assert(JSON.stringify(await read(key)) === JSON.stringify(rotated), 'Locked import replaced the durable record');
  return { address, durableCreate: true, duplicatePreserved: true, verifiedExport: true, passwordRotation: true, workerRestart: true, lockedRejected };
}
