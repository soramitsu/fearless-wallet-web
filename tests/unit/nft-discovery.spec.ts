import type { NftState } from '@extension-base/services/nft-service/types';
import { isNftNetworkScannable, markNftStateStale, stampNftState } from '@/portfolio/nftDiscovery';

const state: NftState = {
  '0xcontract': {
    address: '0xcontract',
    lastSyncedAt: 123,
    name: 'Collection',
    network: 'Ethereum',
    ownedNfts: [
      { id: '1', isOwned: true, meta: {}, network: 'Ethereum', ownedBy: '0xowner', type: 'ERC721' },
    ],
  },
};

describe('NFT discovery policy', () => {
  it('scans production networks independently from display activation and keeps testnets opt-in', () => {
    expect(isNftNetworkScannable('1', new Set())).toBe(true);
    expect(isNftNetworkScannable('137', new Set())).toBe(true);
    expect(isNftNetworkScannable('11155111', new Set())).toBe(false);
    expect(isNftNetworkScannable('11155111', new Set(['11155111']))).toBe(true);
  });

  it('stamps successful snapshots and preserves their data while marking endpoint failures stale', () => {
    const synced = stampNftState(state, 456);
    const stale = markNftStateStale(synced);

    expect(synced['0xcontract']).toMatchObject({ lastSyncedAt: 456, syncStale: false });
    expect(stale['0xcontract']).toMatchObject({
      address: '0xcontract',
      lastSyncedAt: 456,
      syncStale: true,
    });
    expect(stale['0xcontract'].ownedNfts).toEqual(state['0xcontract'].ownedNfts);
  });
});
