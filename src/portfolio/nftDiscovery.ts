import { TEST_NFT_NETWORKS } from '@extension-base/services/nft-service/consts';
import type { NftState } from '@extension-base/services/nft-service/types';

const TEST_NFT_CHAIN_IDS = new Set(Object.keys(TEST_NFT_NETWORKS));

export function isNftNetworkScannable(chainId: string, activeChainIds: ReadonlySet<string>): boolean {
  return !TEST_NFT_CHAIN_IDS.has(chainId) || activeChainIds.has(chainId);
}

export function stampNftState(state: NftState, lastSyncedAt: number): NftState {
  return Object.fromEntries(
    Object.entries(state).map(([contract, collection]) => [
      contract,
      { ...collection, lastSyncedAt, syncStale: false },
    ])
  );
}

export function markNftStateStale(state: NftState): NftState {
  return Object.fromEntries(
    Object.entries(state).map(([contract, collection]) => [contract, { ...collection, syncStale: true }])
  );
}
