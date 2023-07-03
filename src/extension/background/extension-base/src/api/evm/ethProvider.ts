import { ethers } from 'ethers';
import { EvmNetworkType } from '@/interfaces/ether';
export default class EthProvider {
  provider: ethers.WebSocketProvider;
  isReady = false;

  constructor(url: string) {
    this.provider = new ethers.WebSocketProvider(url);

    this.provider._waitUntilReady().then(() => {
      this.isReady = true;
    });

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
