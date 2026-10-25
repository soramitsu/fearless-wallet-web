import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, isEthereumAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

const phrase = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const selectionKey = 'fwcurrent_account:CurrentAccountInfo';

// Public unfunded identities, actual compiled handlers/storage, two worker restarts.
export async function checkAccountRemovalStorage({ send, read, restart, password, assert, eventually }) {
  await cryptoWaitReady();
  const keyring = new Keyring();
  const rows = [];
  for (const type of ['sr25519', 'ed25519', 'ecdsa', 'ethereum']) {
    const expected = keyring.createFromUri(phrase, {}, type);
    const key = `account:${isEthereumAddress(expected.address) ? expected.address.toLowerCase() : u8aToHex(expected.publicKey)}`;
    const address = await send('pri(accounts.create)', { suri: phrase, type, walletEcosystem: 'substrate',
      meta: { name: `Public removal ${type}` } });
    assert(address === expected.address, `${type} import mismatch`);
    rows.push({ type, address, key, ecosystem: 'substrate' });
  }
  const ton = await send('pri(accounts.create)', { suri: phrase, type: 'sr25519', walletEcosystem: 'ton', meta: { name: 'Public removal TON' } });
  rows.push({ type: 'ton', address: ton, key: `ton:${ton}`, ecosystem: 'ton' });
  assert(await send('pri(keyring.unlock)', { password }), 'Unlock for enrollment failed');
  for (const row of rows.filter(({ type }) => ['sr25519', 'ed25519', 'ethereum'].includes(type))) {
    await eventually(async () => {
      const saved = await read(`fw:${row.key}`);
      assert(['bitcoinAddress', 'bitcoinTestnetAddress', 'solanaAddress', 'tonAddress', 'irohaPublicKeyHex']
        .every((field) => saved?.meta[field]), `${row.type} enrollment pending`);
      return true;
    }, `${row.type} enrollment before removal`);
  }
  const primary = rows.find(({ type }) => type === 'ecdsa');
  const linked = rows.find(({ type }) => type === 'ethereum');
  assert(await send('pri(accounts.update.meta)', { address: primary.address, meta: { ethereumAddress: linked.address } }), 'EVM link failed');
  for (const row of rows) row.before = await read(`fw:${row.key}`);
  const roots = rows.filter(({ type }) => type !== 'ethereum');
  for (const row of roots) {
    assert(await send('pri(accounts.update.current)', { address: row.address, walletEcosystem: row.ecosystem }), 'Selection failed');
    assert(await send('pri(accounts.forget)', { address: row.address, type: 'native' }), `${row.type} removal failed`);
    assert(await read(`fw:${row.key}`) === undefined, `${row.type} removal returned before storage`);
    assert((await read(selectionKey))?.address !== row.address, `${row.type} remains selected`);
    const summary = (await send('pri(accounts.deleted.list)', null)).find(({ address }) => address === row.address);
    assert(summary, `${row.type} recovery not listed`);
    row.id = summary.id;
    const archived = await read(`fw:deletedWallet:${row.id}`);
    const copy = row.type === 'ton' ? archived.ton : archived.accounts[row.key];
    assert(JSON.stringify(copy) === JSON.stringify(row.before), `${row.type} recovery is not an exact copy`);
    if (row.type === 'ecdsa') {
      assert(await read(`fw:${linked.key}`) === undefined, 'Linked EVM record survived removal');
      assert(JSON.stringify(archived.accounts[linked.key]) === JSON.stringify(linked.before), 'Linked EVM recovery mismatch');
    }
  }
  const mobile = keyring.createFromUri('//Alice//browser-removal', {}, 'sr25519').address;
  assert(await send('pri(accounts.create.mobile)', { address: mobile, meta: { name: 'Public removal mobile',
    isMobile: true, wcTopic: 'public-removal-mobile', chains: ['10'] } }), 'Mobile creation failed');
  assert(await send('pri(accounts.forget)', { address: mobile, type: 'mobile' }), 'Mobile removal failed');
  const mobileKey = `fw:address:${u8aToHex(keyring.decodeAddress(mobile))}`;
  assert(await read(mobileKey) === undefined && (await read(selectionKey))?.address !== mobile, 'Mobile removal incomplete');
  await restart();
  assert(await send('pri(keyring.unlock)', { password }), 'First restart unlock failed');
  for (const row of rows) assert(await read(`fw:${row.key}`) === undefined, `${row.type} returned after restart`);
  assert(await read(mobileKey) === undefined, 'Mobile wallet returned after restart');
  for (const row of roots) {
    assert((await send('pri(accounts.deleted.restore)', { id: row.id })).ok, `${row.type} restoration failed`);
    const exported = await send('pri(keyring.export.mnemonic)', { address: row.address, password, walletEcosystem: row.ecosystem });
    assert(exported.seed === phrase, `${row.type} restored phrase mismatch`);
  }
  const linkedExport = await send('pri(keyring.export.mnemonic)', { address: linked.address, password, walletEcosystem: 'substrate' });
  assert(linkedExport.seed === phrase, 'Linked EVM restoration did not reopen');
  await restart();
  assert(await send('pri(keyring.unlock)', { password }), 'Second restart unlock failed');
  for (const row of rows) {
    const exported = await send('pri(keyring.export.mnemonic)', { address: row.address, password, walletEcosystem: row.ecosystem });
    assert(exported.seed === phrase, `${row.type} second restart lost recovery`);
  }
  return { types: rows.map(({ type, address }) => ({ type, address })), acknowledgedRemoval: true,
    exactRecoveryCopies: true, groupedLinkedEvmRemoval: true, durableMobileRemoval: true,
    removedSelectionCleared: true, absentAfterRestart: true, recoveryReopensAllKeys: true,
    restoredKeysSurviveSecondRestart: true, twoWorkerRestarts: true, publicUnfundedFixturesOnly: true,
    sessionNegotiationExercised: false };
}
