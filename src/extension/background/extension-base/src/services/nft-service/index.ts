import { type Network } from 'alchemy-sdk';
import NftStore from '@extension-base/stores/Nfts';
import { Subject } from 'rxjs';
import { createSubscription, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import AlchemyNftController from '@extension-base/services/nft-service/handlers/AlchemyNftSdk';
import { PROD_NFT_NETWORKS } from '@extension-base/services/nft-service/consts';
import type { NftState } from '@extension-base/services/nft-service/types';
import type { Port } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';

export class NftService {
  private store: NftStore;
  private sdks: Partial<Record<Network, AlchemyNftController>> = {};
  private nftMap: Record<string, NftState> = {};
  public nftSubject = new Subject<Record<string, NftState>>();

  constructor(private state: State) {
    Object.values(PROD_NFT_NETWORKS).forEach((network) => {
      this.sdks[network] = new AlchemyNftController(network);
    });

    state.currentAccount.then((res) => {
      if (res) this.getNftForAllNetworks(res.ethereumAddress);
    });

    this.store = new NftStore();
  }

  async getNftForAllNetworks(address: string) {
    const networks = Object.keys(this.sdks) as Network[];
    let nfts: NftState = {};

    for (const network of networks) {
      const networkNfts = await this.sdks[network]?.fetchNftsForWallet(address);
      nfts = { ...nfts, ...networkNfts };
    }

    this.nftMap[address] = nfts;
    this.nftSubject.next(this.nftMap);
  }

  async nftSubscribe(id: string, port: Port): Promise<NftState> {
    const cb = createSubscription<'pri(nft.subscribe)'>(id, port);

    const subscription = this.nftSubject.subscribe((nfts: Record<string, NftState>): void => {
      this.state.currentAccount.then((account) => {
        if (account && account.ethereumAddress) cb(nfts[account.ethereumAddress]);
      });
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });
    const account = await this.state.currentAccount;

    if (!account || !account.ethereumAddress) return {};

    return this.nftMap[account.ethereumAddress];
  }
}
