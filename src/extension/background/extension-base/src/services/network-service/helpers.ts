import type { NetworkJson } from '@extension-base/types';
import { isSameString } from '@/helpers';

export const getChainInfoByChainId = (chainMap: Record<string, NetworkJson>, chainId?: number): NetworkJson | null => {
  if (!chainId) return null;

  for (const chainInfo of Object.values(chainMap)) {
    const parsedChainId = parseInt(chainInfo.chainId);

    if (parsedChainId === chainId) return chainInfo;
  }

  return null;
};

export const getChainInfoByHalfGenesisHash = (
  chainMap: Record<string, NetworkJson> | NetworkJson[],
  halfGenesisHash?: string
): NetworkJson | undefined => {
  if (!halfGenesisHash) return;

  const chainInfo = Object.values(chainMap).find((chainInfo) => {
    const substrateGenesisHash = chainInfo.genesisHash ?? '';
    const substrHash = substrateGenesisHash?.substring(2, 2 + 32);

    return isSameString(substrHash, halfGenesisHash);
  });

  return chainInfo;
};
