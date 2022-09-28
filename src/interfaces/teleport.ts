export type RelayChainName = 'polkadot' | 'kusama';
import type { NetworkName } from '@/interfaces/common';

interface BaseInfo {
  teleport: number[];
  paraId: number;
  supportedToken: string[];
}

type SupportedCrossChain = Record<RelayChainName, Record<NetworkName, BaseInfo>>;

export { SupportedCrossChain };
