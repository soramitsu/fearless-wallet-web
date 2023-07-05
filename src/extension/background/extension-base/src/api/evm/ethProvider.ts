import { ethers } from 'ethers';
import { EvmNetworkType } from '@/interfaces/ether';
export default class EthProvider {
  provider: ethers.JsonRpcProvider;
  isReady = false;

  constructor(url: string) {
    this.provider = new ethers.JsonRpcProvider(url);

    console.info(`Ethereum provider is init`);
  }

  static create(network: EvmNetworkType = 'ethereum_goerli') {
    return new EthProvider(network);
  }

  public async getBalance(address: string) {
    const balance = await this.provider.getBalance(address);

    return ethers.formatEther(balance);
  }
}
