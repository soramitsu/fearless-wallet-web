import { Contract } from 'ethers';
import ERC20Contract from '@extension-base/api/evm/helpers/ERC20Contract.json';
import type { EvmProvider } from '@extension-base/background/types/types';

export const REFRESH_TIME = 30000;

export const getERC20Contract = async (contractAddress: string, provider?: EvmProvider): Promise<Contract> => {
  const createContract = () => new Contract(contractAddress, ERC20Contract.abi, provider);

  if (provider) return createContract();

  return new Promise((res) => {
    setTimeout(() => {
      const contract = createContract();

      res(contract);
    }, 3000);
  });
};
