import { ethers } from 'ethers';
import EthWallet from '@/controllers/ethers/ethWallet';
import { ProviderNetworkType } from '@/interfaces/ether';

export default class EthProvider {
  provider: ethers.providers.BaseProvider;

  constructor(network: ProviderNetworkType) {
    this.provider = new ethers.providers.InfuraWebSocketProvider(network, '69a249c61c2d469c8695ddf3a9205961');
  }

  static create(network: ProviderNetworkType = 'homestead') {
    return new EthProvider(network);
  }

  getSigner() {
    const signer = EthWallet.createRandom();
    signer.connect(this.provider);

    return signer;
  }

  public getGasPrice() {
    return this.provider.getGasPrice();
  }
}
