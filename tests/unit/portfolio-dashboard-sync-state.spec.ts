import { computeSyncState, SAVED_AFTER_MS, withSelectedWalletLoad } from '@/portfolio/dashboard/syncState';

const NOW = 1_800_000_000_000;
const wallet = (name: string, ageMs: number | undefined, staleNetworks: string[] = []) => ({
  address: `addr-${name}`,
  name,
  latestTimestamp: ageMs === undefined ? undefined : NOW - ageMs,
  staleNetworks,
});

describe('dashboard sync state', () => {
  it('is live when every wallet is recent and no network failed', () => {
    const state = computeSyncState({ online: true, now: NOW, wallets: [wallet('Main', 5_000), wallet('Savings', 120_000)] });

    expect(state).toEqual({ kind: 'live', savedWallets: [], staleNetworks: [], pendingNetworks: [] });
  });

  it('is updating, not live, while networks of the wallet on screen are still answering', () => {
    const live = computeSyncState({ online: true, now: NOW, wallets: [wallet('Main', 5_000)] });
    const state = withSelectedWalletLoad(live, { pendingNetworks: ['Kusama', 'Acala'], waiting: true });

    expect(state.kind).toBe('updating');
    expect(state.pendingNetworks).toEqual(['Kusama', 'Acala']);
    expect(state.staleNetworks).toEqual([]);
  });

  it('lists the networks that never answered once the wait is over, and leaves the state to what the wallet holds', () => {
    const live = computeSyncState({ online: true, now: NOW, wallets: [wallet('Main', 5_000)] });
    const failed = computeSyncState({ online: true, now: NOW, wallets: [wallet('Main', 5_000, ['Moonbeam'])] });

    // A registry network that no longer runs must not make every total "partial".
    expect(withSelectedWalletLoad(live, { pendingNetworks: ['Clover'], waiting: false })).toMatchObject({
      kind: 'live',
      pendingNetworks: ['Clover'],
    });
    // A network that failed where the wallet holds value still does.
    expect(withSelectedWalletLoad(failed, { pendingNetworks: ['Acala'], waiting: false })).toMatchObject({
      kind: 'partial',
      staleNetworks: ['Moonbeam'],
      pendingNetworks: ['Acala'],
    });
  });

  it('leaves the state alone when every network answered, and stays offline when offline', () => {
    const saved = computeSyncState({ online: true, now: NOW, wallets: [wallet('Main', SAVED_AFTER_MS + 1)] });
    const offline = computeSyncState({ online: false, now: NOW, wallets: [wallet('Main', 5_000)] });

    expect(withSelectedWalletLoad(saved, { pendingNetworks: [], waiting: true })).toBe(saved);
    expect(withSelectedWalletLoad(saved, undefined)).toBe(saved);
    expect(withSelectedWalletLoad(offline, { pendingNetworks: ['Kusama'], waiting: true })).toBe(offline);
  });

  it('does not claim a state for a wallet with no balance time, and is live for it', () => {
    expect(computeSyncState({ online: true, now: NOW, wallets: [wallet('Empty', undefined)] }).kind).toBe('live');
    expect(computeSyncState({ online: true, now: NOW, wallets: [] }).kind).toBe('live');
  });

  it('is saved, with the oldest age first, once a wallet is older than the threshold', () => {
    const state = computeSyncState({
      online: true,
      now: NOW,
      wallets: [wallet('Main', 1_000), wallet('Trading', SAVED_AFTER_MS + 60_000), wallet('Savings', 2 * 60 * 60 * 1000)],
    });

    expect(state.kind).toBe('saved');
    expect(state.savedWallets.map(({ name }) => name)).toEqual(['Savings', 'Trading']);
    expect(state.oldestAgeMs).toBe(2 * 60 * 60 * 1000);
  });

  it('treats exactly the threshold as still recent', () => {
    expect(computeSyncState({ online: true, now: NOW, wallets: [wallet('Main', SAVED_AFTER_MS)] }).kind).toBe('live');
  });

  it('is partial when a network failed, and names each network once', () => {
    const state = computeSyncState({
      online: true,
      now: NOW,
      wallets: [wallet('Main', 1_000, ['Polkadot']), wallet('Savings', 1_000, ['Polkadot', 'Arbitrum One'])],
    });

    expect(state.kind).toBe('partial');
    expect(state.staleNetworks).toEqual(['Arbitrum One', 'Polkadot']);
  });

  it('puts a failed network ahead of an old balance, and offline ahead of everything', () => {
    const wallets = [wallet('Main', 3 * 60 * 60 * 1000, ['Polkadot'])];

    expect(computeSyncState({ online: true, now: NOW, wallets }).kind).toBe('partial');
    expect(computeSyncState({ online: false, now: NOW, wallets }).kind).toBe('offline');
  });
});
