import { Contract } from 'ethers';
import ERC20Contract from '@extension-base/api/evm/helpers/ERC20Contract.json';
import ERC721 from '@extension-base/api/evm/helpers/ERC721.json';

import type { EvmProvider } from '@extension-base/background/types/types';

export const REFRESH_TIME = 30000;

export const getContract = async (
  contractAddress: string,
  provider?: EvmProvider,
  networkType: 'erc20' | 'erc721' = 'erc20'
): Promise<Contract> => {
  const abi = networkType === 'erc20' ? ERC20Contract : ERC721;
  const createContract = () => new Contract(contractAddress, abi, provider);

  if (provider) return createContract();

  return new Promise((res) => {
    setTimeout(() => {
      const contract = createContract();

      res(contract);
    }, 3000);
  });
};
