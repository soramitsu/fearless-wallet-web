import { ethers } from 'ethers';

export default class EthContract {
  contract: ethers.Contract;
  signer: Nullable<ethers.Signer>;
  abi = [
    // Some details about the token
    'function name() view returns (string)',
    'function symbol() view returns (string)',

    // Get the account balance
    'function balanceOf(address) view returns (uint)',
    'function decimals() view returns (uint256)',

    // Send some of your tokens to someone else
    'function transfer(address to, uint amount)',

    // An event triggered whenever anyone transfers to someone else
    'event Transfer(address indexed from, address indexed to, uint amount)',
  ];

  constructor(contractAddress: string, provider: ethers.providers.Provider, signer?: ethers.Signer) {
    this.contract = new ethers.Contract(contractAddress, this.abi, provider);
    if (signer) this.signer = signer;
  }

  async connectSigner(signer: ethers.Signer) {
    this.contract.connect(signer);
  }

  async getBalance(address: string) {
    const balance = await this.contract.balanceOf(address);
    const decimals = await this.contract.decimals();

    return ethers.utils.formatUnits(balance, decimals);
  }
}
