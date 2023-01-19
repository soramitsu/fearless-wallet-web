import { ethers } from 'ethers';

import EthWallet from '@/extension/background/extension-base/src/api/evm/ethWallet';
import { EvmNetworkType } from '@/interfaces/ether';

const providers: Record<EvmNetworkType, string> = {
  homestead: 'wss://eth-mainnet.g.alchemy.com/v2/r2rCN7zWhPZ0cggKYqk_MElwxrrRM4Kw',
  goerli: 'wss://eth-goerli.g.alchemy.com/v2/WJz4vP6DoqLvRxiJDofxQWq8Fc9UCLbH',
};
export default class EthProvider {
  provider: ethers.providers.BaseProvider;

  constructor(network: EvmNetworkType) {
    this.provider = new ethers.providers.WebSocketProvider(providers[network], network);
    console.info(`Provider of ${network} is init`);
  }

  static create(network: EvmNetworkType = 'goerli') {
    return new EthProvider(network);
  }

  getSigner() {
    const signer = EthWallet.createRandom();
    signer.connect(this.provider);

    return signer;
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
