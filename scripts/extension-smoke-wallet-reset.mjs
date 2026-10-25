import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, isEthereumAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

const phrase = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';

// Public unfunded fixtures. Real compiled handlers and Chrome storage; SDK
// negotiation and interrupted writes are covered separately, not simulated here.
export async function checkWalletResetStorage({ send, read, restart, password, assert, eventually }) {
  await cryptoWaitReady();
  const keyring = new Keyring();
  const rows = [];
  for (const type of ['sr25519', 'ed25519', 'ecdsa', 'ethereum']) {
    const expected = keyring.createFromUri(phrase, {}, type);
    const key = `account:${isEthereumAddress(expected.address) ? expected.address.toLowerCase() : u8aToHex(expected.publicKey)}`;
    const address = await send('pri(accounts.create)', { suri: phrase, type, walletEcosystem: 'substrate',
      meta: { name: `Public reset ${type}` } });
    assert(address === expected.address, `${type} import mismatch`);
    rows.push({ type, address, key });
  }
  const ton = await send('pri(accounts.create)', { suri: phrase, type: 'sr25519', walletEcosystem: 'ton',
    meta: { name: 'Public retained reset TON' } });
  assert(await send('pri(keyring.unlock)', { password }), 'Unlock for enrollment failed');
  for (const row of rows.filter(({ type }) => ['sr25519', 'ed25519', 'ethereum'].includes(type))) {
    await eventually(async () => {
      const saved = await read(`fw:${row.key}`);
      return ['bitcoinAddress', 'bitcoinTestnetAddress', 'solanaAddress', 'tonAddress', 'irohaPublicKeyHex']
        .every((field) => saved?.meta[field]);
    }, `${row.type} enrollment before reset`);
  }
  const primary = rows.find(({ type }) => type === 'ecdsa');
  const linked = rows.find(({ type }) => type === 'ethereum');
  assert(await send('pri(accounts.update.meta)', { address: primary.address, meta: { ethereumAddress: linked.address } }), 'EVM link failed');
  for (const row of rows) row.before = await read(`fw:${row.key}`);
  const tonBefore = await read(`fw:ton:${ton}`);
  // An older recovery entry must survive the whole reset without being rewritten.
  const older = rows.find(({ type }) => type === 'ed25519');
  assert(await send('pri(accounts.forget)', { address: older.address, type: 'native' }), 'Pre-reset archival failed');
  const olderSummary = (await send('pri(accounts.deleted.list)', null)).find(({ address }) => address === older.address);
  const olderBefore = await read(`fw:deletedWallet:${olderSummary.id}`);
  const mobile = keyring.createFromUri('//Alice//browser-reset', {}, 'sr25519');
  const mobileTopic = 'public-reset-saved-mobile-topic';
  assert(await send('pri(accounts.create.mobile)', { address: mobile.address,
    meta: { name: 'Public reset mobile', isMobile: true, wcTopic: mobileTopic, chains: ['10'] } }), 'Mobile creation failed');
  assert(await send('pri(accounts.update.current)', { address: primary.address, walletEcosystem: 'substrate' }), 'Selection failed');
  assert(await send('pri(keyring.reset)', null), 'Whole reset failed');
  assert(!(await send('pri(keyring.hasMasterPassword)', null)), 'Reset retained the active password');
  assert(await read('fw:keyring') === undefined, 'Password storage removal was not acknowledged');
  assert(await read('fwcurrent_account:CurrentAccountInfo') === null, 'Reset selection was not durably cleared');
  assert(await read(`fw:address:${u8aToHex(mobile.publicKey)}`) === undefined, 'Reset kept the mobile address');
  assert((await read('fwWalletConnect:retiredTopics'))?.topics.includes(mobileTopic), 'Saved mobile topic was not durably retired');
  assert(JSON.stringify(await read(`fw:ton:${ton}`)) === JSON.stringify(tonBefore), 'Reset changed retained TON ciphertext');
  assert(JSON.stringify(await read(`fw:deletedWallet:${olderSummary.id}`)) === JSON.stringify(olderBefore), 'Reset changed an older recovery archive');
  const summaries = await send('pri(accounts.deleted.list)', null);
  for (const row of rows.filter(({ type }) => type !== 'ethereum')) {
    assert(await read(`fw:${row.key}`) === undefined, `${row.type} active key survived reset`);
    const summary = summaries.find(({ address }) => address === row.address);
    assert(summary, `${row.type} recovery not listed`);
    row.id = summary.id;
    const archive = await read(`fw:deletedWallet:${row.id}`);
    assert(JSON.stringify(archive.accounts[row.key]) === JSON.stringify(row.before), `${row.type} recovery changed bytes`);
    if (row === primary) {
      assert(await read(`fw:${linked.key}`) === undefined, 'Linked EVM key remained active');
      assert(JSON.stringify(archive.accounts[linked.key]) === JSON.stringify(linked.before), 'Linked EVM recovery changed bytes');
    }
  }
  await restart();
  assert(!(await send('pri(keyring.hasMasterPassword)', null)), 'Reset password returned after restart');
  for (const row of rows) assert(await read(`fw:${row.key}`) === undefined, `${row.type} returned after restart`);
  const nextPassword = `${password}-after-reset`;
  assert(await send('pri(keyring.changePassword)', { newPassword: nextPassword }), 'New password setup failed');
  for (const row of rows.filter(({ type }) => type !== 'ethereum'))
    assert((await send('pri(accounts.deleted.restore)', { id: row.id })).ok, `${row.type} restore failed`);
  for (const row of rows) {
    const exported = await send('pri(keyring.export.mnemonic)', { address: row.address, password, walletEcosystem: 'substrate' });
    assert(exported.seed === phrase, `${row.type} old-password recovery failed`);
  }
  await restart();
  assert(await send('pri(keyring.unlock)', { password: nextPassword }), 'New password did not survive restart');
  for (const row of rows) {
    const exported = await send('pri(keyring.export.mnemonic)', { address: row.address, password, walletEcosystem: 'substrate' });
    assert(exported.seed === phrase, `${row.type} recovered phrase was lost after second restart`);
  }
  assert(JSON.stringify(await read(`fw:ton:${ton}`)) === JSON.stringify(tonBefore), 'Retained TON ciphertext changed across restarts');
  return { types: rows.map(({ type, address }) => ({ type, address })), acknowledgedReset: true,
    exactRecoveryCopies: true, olderArchivePreserved: true, groupedLinkedEvmRecovery: true,
    savedMobileTopicRetired: true, passwordAndSelectionCleared: true, tonCiphertextRetained: true,
    oldPasswordRecoveryReopensNativeKeys: true, twoWorkerRestarts: true, publicUnfundedFixturesOnly: true,
    sessionNegotiationExercised: false, tonOldPasswordRecoveryExercised: false };
}
