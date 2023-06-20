import { ethers } from 'ethers';
import { EvmNetworkType } from '@/interfaces/ether';
export default class EthProvider {
  provider: ethers.providers.BaseProvider;
  isReady = false;
  constructor(url: string) {
    this.provider = new ethers.providers.WebSocketProvider(url);
    this.provider._ready().then(() => {
      this.isReady = true;
    });

    console.info(`Ethereum provider is init`);
  }

  static create(network: EvmNetworkType = 'ethereum_goerli') {
    return new EthProvider(network);
  }

  public async getBalance(address: string) {
    const balance = await this.provider.getBalance(address);

    return ethers.utils.formatEther(balance);
  }

  public getGasPrice() {
    return this.provider.getGasPrice();
  }

  public getEstimateGas(tx: ethers.providers.TransactionRequest) {
    return this.provider.estimateGas(tx);
  }
}
