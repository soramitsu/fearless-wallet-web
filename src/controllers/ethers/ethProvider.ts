import { ethers } from 'ethers';
import EthWallet from '@/controllers/ethers/ethWallet';

class EthProvider {
  provider: ethers.providers.BaseProvider;

  constructor() {
    this.provider = new ethers.providers.EtherscanProvider('homestead', 'ZWNEGMN2EBP34B8B25MQWGTBPSNZG4VBY1');
    EthWallet.createFromMnemonic('antique scrub mix lyrics pear legal buddy used silent consider delay utility');
  }

  static create() {
    return new EthProvider();
  }
}

export const ethProvider = EthProvider.create();
