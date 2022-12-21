import { ethers } from 'ethers';

class EthProvider {
  provider: ethers.providers.WebSocketProvider;
  constructor() {
    this.provider = new ethers.providers.WebSocketProvider(
      'wss://mainnet.infura.io/ws/v3/69a249c61c2d469c8695ddf3a9205961'
    );
  }

  static create() {
    return new EthProvider();
  }

  async getTokenBalance() {
    const abi = [
      'function balanceOf(walletAddress) view returns (uint256)',
      'function decimals() view returns (uint256)',
    ];
    const newContract = new ethers.Contract('0xdAC17F958D2ee523a2206206994597C13D831ec7', abi, this.provider);
    const decimals = await newContract.decimals();
  }
}

export const ethProvider = EthProvider.create();
