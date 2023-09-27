import type { NetworkJson } from '@extension-base/types';

export function _getSubstrateGenesisHash(chainInfo: NetworkJson) {
  return chainInfo.genesisHash || '';
}

export const findChainInfoByChainId = (chainMap: Record<string, NetworkJson>, chainId?: number): NetworkJson | null => {
  if (!chainId) return null;

  for (const chainInfo of Object.values(chainMap)) {
    const parsedChainId = parseInt(chainInfo.chainId);

    if (parsedChainId === chainId) return chainInfo;
  }

  return null;
};
