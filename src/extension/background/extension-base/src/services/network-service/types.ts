import { type EvmApiProps, type ApiProps } from '@extension-base/background/types/types';
import { type NetworkName } from '@/interfaces';

export type APIs = {
  evm: Record<string, EvmApiProps>;
  substrate: Record<NetworkName, ApiProps>;
};
