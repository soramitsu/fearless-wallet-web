import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

// Public, unfunded address only. This exercises offline compiled message handlers and
// Chrome storage/reload; no real WalletConnect session or remote signing is involved.
export async function checkMobileAddressStorage({ send, read, restart, password, assert }) {
  await cryptoWaitReady();
  const pair = new Keyring({ type: 'sr25519' }).createFromUri('//Alice//mobile-storage');
  const address = pair.address;
  const key = `fw:address:${u8aToHex(pair.publicKey)}`;
  pair.lock();
  const meta = { name: 'Public mobile persistence', isMobile: true, wcTopic: 'offline-public-topic', chains: ['10'] };
  assert(await send('pri(accounts.create.mobile)', { address, meta }) === true, 'Mobile address creation was not acknowledged');
  const created = await read(key);
  assert(created?.address === address && created.meta.wcTopic === meta.wcTopic, 'Mobile public record missing after acknowledged create');
  assert(created.encoded === undefined, 'Public mobile account unexpectedly contains an encrypted key');
  assert(await send('pri(accounts.name)', { address, name: 'Public renamed mobile' }), 'Mobile rename failed');
  assert((await read(key)).meta.name === 'Public renamed mobile', 'Rename acknowledged before durable metadata');
  await Promise.all([
    send('pri(accounts.update.meta)', { address, meta: { tags: ['Public persisted tag'] } }),
    send('pri(accounts.update.meta)', { address, meta: { chains: ['42161'] } }),
  ]);
  const committed = await read(key);
  assert(committed.meta.name === 'Public renamed mobile' && committed.meta.tags[0] === 'Public persisted tag' &&
    committed.meta.chains[0] === '42161' && committed.meta.wcTopic === meta.wcTopic, 'Concurrent mobile updates lost metadata');
  await restart();
  assert(await send('pri(keyring.unlock)', { password }), 'Fixture wallet did not reopen');
  const accounts = await send('pri(accounts.subscribe)', null);
  const restored = accounts.filter((item) => item.address === address);
  assert(restored.length === 1 && restored[0].name === committed.meta.name, 'Restart did not load the single renamed mobile wallet');
  assert(JSON.stringify(await read(key)) === JSON.stringify(committed), 'Restart changed the public address record');
  assert(await send('pri(accounts.name)', { address, name: 'Public second restart' }), 'Restarted mobile address could not rename');
  await restart();
  assert(await send('pri(keyring.unlock)', { password }), 'Second restart failed');
  assert((await read(key)).meta.name === 'Public second restart', 'Second restart lost renamed mobile wallet');
  return { address, durableCreate: true, durableRename: true, concurrentMetadataPreserved: true,
    publicRecordOnly: true, twoWorkerRestarts: true, sessionNegotiationExercised: false };
}
