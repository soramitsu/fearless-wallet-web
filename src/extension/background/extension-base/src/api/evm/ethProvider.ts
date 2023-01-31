import { ethers } from 'ethers';

import { EvmNetworkType } from '@/interfaces/ether';

const providers: Record<EvmNetworkType, string> = {
  ethereum: 'wss://eth-mainnet.g.alchemy.com/v2/r2rCN7zWhPZ0cggKYqk_MElwxrrRM4Kw',
  ethereum_goerli: 'wss://eth-goerli.g.alchemy.com/v2/WJz4vP6DoqLvRxiJDofxQWq8Fc9UCLbH',
};
export default class EthProvider {
  provider: ethers.providers.BaseProvider;
  isReady = false;
  constructor(network: EvmNetworkType) {
    this.provider = new ethers.providers.WebSocketProvider(providers[network]);
    this.provider._ready().then((res) => {
      this.isReady = true;
    });

    console.info(`Provider of ${network} is init`);
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
