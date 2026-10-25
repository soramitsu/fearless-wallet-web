import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

// Public metadata only. Actual compiled trusted handlers and Chrome persistence;
// retained SDK authority and storage failures are exercised by the service tests.
export async function checkSessionRetirementStorage({ send, read, restart, password, assert, eventually }) {
  await cryptoWaitReady();
  const pair = new Keyring({ type: 'sr25519' }).createFromUri('//Alice//session-retirement');
  const address = pair.address;
  const addressKey = `fw:address:${u8aToHex(pair.publicKey)}`;
  pair.lock();
  const mobileTopic = 'offline-public-mobile-retirement';
  const incomingTopic = 'offline-public-incoming-retirement';
  const journalKey = 'fwWalletConnect:retiredTopics';
  assert(await send('pri(accounts.create.mobile)', { address, meta: {
    name: 'Public retirement fixture', isMobile: true, wcTopic: mobileTopic, chains: ['10'],
  } }), 'Mobile fixture creation failed');
  assert((await read(addressKey))?.meta.wcTopic === mobileTopic, 'Mobile fixture not saved');
  assert(await send('pri(accounts.forget)', { address, type: 'mobile' }), 'Mobile removal was not acknowledged');
  assert((await read(journalKey))?.topics.includes(mobileTopic), 'Removal acknowledged before retirement persisted');
  await eventually(async () => (await read(addressKey)) === undefined, 'mobile public address removal');
  assert(await send('pri(walletConnect.session.disconnect)', { topic: incomingTopic }), 'Incoming retirement was not acknowledged');
  const expected = await read(journalKey);
  assert(expected?.version === 1 && expected.topics.includes(mobileTopic) && expected.topics.includes(incomingTopic),
    'Both session retirements must be durable before acknowledgement');
  for (let restartNumber = 1; restartNumber <= 2; restartNumber++) {
    await restart();
    assert(await send('pri(keyring.unlock)', { password }), 'Fixture wallet did not reopen');
    assert(JSON.stringify(await read(journalKey)) === JSON.stringify(expected), 'Worker restart changed retirement journal');
    assert((await read(addressKey)) === undefined, 'Removed public address returned after restart');
    assert(await send('pri(walletConnect.session.disconnect)', { topic: incomingTopic }), 'Retirement retry after restart failed');
    assert(JSON.stringify(await read(journalKey)) === JSON.stringify(expected), 'Retirement retry lost or duplicated entries');
  }
  return { address, mobileRemovalAcknowledgedAfterRetirement: true, incomingDisconnectAcknowledgedAfterRetirement: true,
    retirementJournalSurvivesTwoWorkerRestarts: true, retirementRetryIdempotent: true,
    publicMetadataOnly: true, sessionNegotiationExercised: false, retainedSdkRevivalExercised: false };
}
