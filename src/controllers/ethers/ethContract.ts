import { ethers } from 'ethers';

export default class EthContract {
  contract: ethers.Contract;

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

  constructor(address: string, signerOrProvider?: ethers.Signer | ethers.providers.Provider) {
    this.contract = new ethers.Contract(address, this.abi, signerOrProvider);
  }

  getName() {
    return this.contract.name();
  }

  getSymbol() {
    return this.contract.symbol();
  }

  getDecimals() {
    return this.contract.decimals();
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
