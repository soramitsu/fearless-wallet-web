import { Contract } from 'ethers';
import ERC20Contract from '@extension-base/api/evm/helpers/ERC20Contract.json';
import type State from '@extension-base/background/handlers/State';

export const REFRESH_TIME = 30000;

export const getERC20Contract = async (network: string, contractAddress: string, state: State): Promise<Contract> => {
  const createContract = () =>
    new Contract(contractAddress, ERC20Contract.abi, state.getEvmApiMap[network.toLowerCase()]);

  if (state.getEvmApiMap[network]) return createContract();

  return new Promise((res) => {
    setTimeout(() => {
      const contract = createContract();

      res(contract);
    }, 3000);
  });
};
