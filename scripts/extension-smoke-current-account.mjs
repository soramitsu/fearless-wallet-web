import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';

// Actual compiled trusted handlers and Chrome persistence, using only public
// unfunded identities. Service tests cover deferred/failed storage and pairing.
export async function checkCurrentAccountStorage({ send, read, restart, fixture, password, assert }) {
  await cryptoWaitReady();
  const keys = new Keyring({ type: 'sr25519' });
  const addresses = ['first', 'second'].map((name) => {
    const pair = keys.createFromUri(`//Alice//selection-${name}`);
    const address = pair.address;
    pair.lock();
    return address;
  });
  const key = 'fwcurrent_account:CurrentAccountInfo';
  const topics = ['public-selection-first', 'public-selection-second'];
  for (const [index, address] of addresses.entries()) {
    assert(await send('pri(accounts.create.mobile)', { address, meta: {
      name: `Public selection ${index}`, isMobile: true, wcTopic: topics[index], chains: ['10'],
    } }), 'Mobile creation did not acknowledge its selection');
    const saved = await read(key);
    assert(saved?.address === address && saved.wcTopic === topics[index], 'Acknowledged mobile selection is not durable');
  }
  for (const address of addresses) {
    assert(await send('pri(accounts.update.current)', { address, walletEcosystem: 'substrate' }), 'Wallet switch failed');
    assert((await read(key))?.address === address, 'Switch completed before selection was saved');
  }
  const beforeMetadata = await read(key);
  assert(await send('pri(accounts.update.meta)', { address: addresses[0], meta: { ethereumAddress: `0x${'33'.repeat(20)}` } }),
    'Public metadata update failed');
  assert(JSON.stringify(await read(key)) === JSON.stringify(beforeMetadata), 'Other-wallet metadata changed the selected wallet');
  await restart();
  assert(await send('pri(keyring.unlock)', { password }), 'Fixture wallet did not reopen');
  assert(!addresses.includes((await read(key))?.address), 'Startup restored a mobile selection without an approved session');
  // These offline mobile topics have never completed WalletConnect approval, so
  // startup must exclude them. Verify durable selection with the generated local
  // wallet instead of expecting an unapproved session to regain authority.
  const native = keys.createFromUri(fixture.mnemonic);
  const nativeAddress = native.address;
  native.lock();
  assert(await send('pri(accounts.update.current)', { address: nativeAddress, walletEcosystem: 'substrate' }), 'Local wallet switch failed');
  assert((await read(key))?.address === nativeAddress, 'Local selection was not durable before acknowledgement');
  await restart();
  assert(await send('pri(keyring.unlock)', { password }), 'Local selection restart did not reopen');
  assert((await read(key))?.address === nativeAddress, 'Worker restart lost acknowledged local selection');
  assert(await send('pri(accounts.update.current)', { address: addresses[1], walletEcosystem: 'substrate' }), 'Mobile reselection failed');
  assert(await send('pri(walletConnect.session.disconnect)', { topic: topics[1] }), 'Retirement did not acknowledge');
  await restart();
  assert(await send('pri(keyring.unlock)', { password }), 'Retirement restart did not reopen');
  assert((await read(key))?.address !== addresses[1], 'Startup restored or reselected the retired mobile wallet');
  return { addresses, durableCreateAndSelection: true, durableSwitch: true, otherWalletMetadataIsolated: true,
    localSelectionSurvivesRestart: true, unapprovedMobileSelectionNotRestored: true, retiredSelectionNotRestoredOrChosenAsFallback: true,
    threeWorkerRestarts: true, publicMetadataAndUnfundedFixtureOnly: true, sessionNegotiationExercised: false };
}
