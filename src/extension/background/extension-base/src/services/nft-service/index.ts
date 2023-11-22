import { Network, Alchemy } from 'alchemy-sdk';

export class NftService extends Alchemy {
  constructor() {
    super({
      apiKey: process.env.FL_ALCHEMY_API_ETHEREUM_KEY, // Replace with your Alchemy API Key.
      network: Network.ETH_MAINNET, // Replace with your network.
    });
  }

  async getNfts(address: string) {
    return this.nft.getNftsForOwner(address);
  }
}
