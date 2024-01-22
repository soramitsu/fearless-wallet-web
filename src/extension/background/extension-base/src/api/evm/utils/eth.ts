import { Contract, type ContractRunner } from 'ethers';
import ERC20Contract from '@extension-base/api/evm/helpers/ERC20Contract.json';
import ERC721 from '@extension-base/api/evm/helpers/ERC721.json';

export const REFRESH_TIME = 30000;

export const getContract = async (
  contractAddress: string,
  runner?: ContractRunner,
  networkType: 'erc20' | 'erc721' = 'erc20'
): Promise<Contract> => {
  const abi = networkType === 'erc20' ? ERC20Contract : ERC721;
  const createContract = () => new Contract(contractAddress, abi, runner);

  if (runner) return createContract();

  return new Promise((res) => {
    setTimeout(() => {
      const contract = createContract();

      res(contract);
    }, 3000);
  });
};
