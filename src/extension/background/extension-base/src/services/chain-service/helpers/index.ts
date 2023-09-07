import { NetworkJson } from '../../../types';

export function _getSubstrateGenesisHash(chainInfo: NetworkJson) {
  return chainInfo.genesisHash || '';
}

export const findChainInfoByHalfGenesisHash = (
  chainMap: Record<string, NetworkJson>,
  halfGenesisHash?: string
): NetworkJson | null => {
  if (!halfGenesisHash) {
    return null;
  }

  for (const chainInfo of Object.values(chainMap)) {
    if (
      _getSubstrateGenesisHash(chainInfo)
        ?.toLowerCase()
        .substring(2, 2 + 32) === halfGenesisHash.toLowerCase()
    ) {
      return chainInfo;
    }
  }

  return null;
};

export const findChainInfoByChainId = (chainMap: Record<string, NetworkJson>, chainId?: number): NetworkJson | null => {
  if (!chainId) return null;

  for (const chainInfo of Object.values(chainMap)) {
    const parsedChainId = parseInt(`0x${chainInfo.chainId}`);

    if (parsedChainId === chainId) return chainInfo;
  }

  return null;
};
