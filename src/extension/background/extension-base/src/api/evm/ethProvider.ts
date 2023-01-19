import { ethers } from 'ethers';
import EthWallet from '@/extension/background/extension-base/src/api/evm/ethWallet';
import { EvmNetworkType } from '@/interfaces/ether';

export default class EthProvider {
  provider: ethers.providers.BaseProvider;

  constructor(network: EvmNetworkType) {
    this.provider = new ethers.providers.JsonRpcProvider(network, '69a249c61c2d469c8695ddf3a9205961');
  }

  static create(network: EvmNetworkType = 'goerli') {
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
  public getEstimateGas(tx: ethers.providers.TransactionRequest) {
    return this.provider.estimateGas(tx);
  }
}
