import { ethers } from 'ethers';
import EthWallet from '@/controllers/ethers/ethWallet';

export default class EthProvider {
  provider: ethers.providers.BaseProvider;

  constructor(url: string) {
    this.provider = new ethers.providers.AlchemyWebSocketProvider(url);
  }

  static create(url: string) {
    return new EthProvider(url);
  }

  public getGasPrice() {
    return this.provider.getGasPrice();
  }
}
