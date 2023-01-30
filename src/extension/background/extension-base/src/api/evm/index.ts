import EthProvider from './ethProvider';
import { EvmNetworkType } from '@/interfaces/ether';

export const initWeb3Api = (provider: string): EthProvider => {
  return new EthProvider(provider as EvmNetworkType);
};
