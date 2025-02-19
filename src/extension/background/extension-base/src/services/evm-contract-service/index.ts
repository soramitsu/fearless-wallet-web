import { Contract, type ContractRunner } from 'ethers';
import ERC20Contract from '@extension-base/services/evm-contract-service/evm-contracts/ERC20Contract.json';
import ERC721 from '@extension-base/services/evm-contract-service/evm-contracts/ERC721.json';
import ERC1155 from '@extension-base/services/evm-contract-service/evm-contracts/ERC1155.json';

export const REFRESH_TIME = 30000;

export default class EvmContractService {
  async getContract(
    contractAddress: string,
    runner?: ContractRunner,
    networkType: 'erc20' | 'ERC721' | 'ERC1155' = 'erc20'
  ): Promise<Contract> {
    const abis = {
      ERC1155: ERC1155,
      ERC721: ERC721,
      erc20: ERC20Contract,
    } as const;
    const abi = abis[networkType];

    const createContract = () => new Contract(contractAddress, abi, runner);

    if (runner) return createContract();

    return new Promise((res) => {
      setTimeout(() => {
        const contract = createContract();

        res(contract);
      }, 3000);
    });
  }
}
