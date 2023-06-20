import EthProvider from '@extension-base/api/evm/ethProvider';

export const initWeb3Api = (url: string): EthProvider => {
  return new EthProvider(url);
};
