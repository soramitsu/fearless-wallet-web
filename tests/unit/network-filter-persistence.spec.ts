import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { useAccountsStore } from '@/stores/accounts';

vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/extension/messaging/asset-discovery', () => ({ forceAssetDiscoverySweep: vi.fn() }));

const FIRST = '5GrwvaEF5zXb26Fz9rcQpDWS64pdDujn2AUVFQZh3aTw6rVqY';
const SECOND = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';

// A popup open: a new store over what the previous one stored.
function openPopup(address = FIRST) {
  setActivePinia(createPinia());
  const store = useAccountsStore();
  store.selectedWallet = { ...store.selectedWallet, address };

  return store;
}

describe('network filter of each wallet', () => {
  beforeEach(() => localStorage.clear());

  // New wallets are stored with the popular networks, which leave out Polkadot and Kusama Asset Hub. Every popup start
  // and wallet update brought them back after All networks was chosen.
  it('keeps the filter chosen in the network list across popup opens and background updates', () => {
    const first = openPopup();
    first.seedSelectedNetwork(POPULAR_NETWORKS);
    expect(first.selectedNetwork).toBe(POPULAR_NETWORKS);

    first.setSelectedNetwork(ALL_NETWORKS);
    first.seedSelectedNetwork(POPULAR_NETWORKS);
    expect(first.selectedNetwork).toBe(ALL_NETWORKS);

    const reopened = openPopup();
    expect(reopened.selectedNetwork).toBe(ALL_NETWORKS);
    reopened.seedSelectedNetwork(POPULAR_NETWORKS);
    expect(reopened.selectedNetwork).toBe(ALL_NETWORKS);
  });

  it('follows the background for a wallet whose filter was never chosen, and keeps wallets apart', () => {
    const store = openPopup();
    store.setSelectedNetwork('Polkadot');

    store.selectedWallet = { ...store.selectedWallet, address: SECOND };
    store.seedSelectedNetwork(ALL_NETWORKS);
    store.seedSelectedNetwork(POPULAR_NETWORKS);
    expect(store.selectedNetwork).toBe(POPULAR_NETWORKS);

    expect(openPopup(FIRST).selectedNetwork).toBe('Polkadot');
    expect(openPopup(SECOND).selectedNetwork).toBe(ALL_NETWORKS);
  });

  it('still applies a chosen filter for this popup when it cannot be stored', () => {
    const store = openPopup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    store.setSelectedNetwork(ALL_NETWORKS);

    expect(store.selectedNetwork).toBe(ALL_NETWORKS);
    vi.restoreAllMocks();
  });
});
