import { Subject } from 'rxjs';
import NetworkMapStore from '@extension-base/stores/NetworkMap';
import { type NetworkJson } from '@extension-base/types';
import { type NETWORK_STATUS } from '@extension-base/api/types/networks';
import { storage } from '@extension-base/stores/Storage';
import { EvmApiHandler } from '@extension-base/services/network-service/handlers/EvmApiHandler';
import { SubstrateApiHandler } from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import type State from '@/extension/background/extension-base/src/background/handlers/State';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { type ApiMap } from '@/extension/background/extension-base/src/background/types/types';

export class NetworkService {
  private networkMapSubject: Subject<Record<string, NetworkJson>>;
  readonly networkMapStore: NetworkMapStore; // persist custom networkMap by user
  public networksGithub: NetworkJson[] = []; // networks from github
  public networkMap: Record<string, NetworkJson> = {}; // mapping to networkMapStore, for uses in background
  public selectedNetworks: Record<string, string>;
  substrateApiHandler: SubstrateApiHandler;
  evmApiHandler: EvmApiHandler;

  constructor(state: State) {
    this.networkMapSubject = new Subject<Record<string, NetworkJson>>();
    this.networkMapStore = new NetworkMapStore();
    this.selectedNetworks = {};
    this.substrateApiHandler = new SubstrateApiHandler(this, state);
    this.evmApiHandler = new EvmApiHandler(this);

    storage.get(['selectedNetworks']).then(({ selectedNetworks }) => {
      if (selectedNetworks) this.selectedNetworks = selectedNetworks;
    });
  }

  get networkValues() {
    return Object.values(this.networkMap);
  }

  get assetsMap() {
    return this.networkValues.map(({ assets }) => assets).flat();
  }

  updateNetworks() {
    this.networkMapSubject.next(this.networkMap);
    this.updateNetworkStore();
  }

  getStoredNetworks(): Promise<Record<string, NetworkJson> | undefined> {
    return new Promise<Record<string, NetworkJson>>((res) => {
      this.networkMapStore.get('NetworkMap', (accountsFromStorage) => {
        res(accountsFromStorage);
      });
    });
  }

  updateNetworkStore() {
    this.networkMapStore.set('NetworkMap', this.networkMap);
  }

  get getApiMap(): ApiMap {
    return {
      substrate: this.substrateApiHandler.api,
      evm: this.evmApiHandler.api,
    };
  }

  subscribeNetworkMap() {
    return this.networkMapStore.subject;
  }

  getNetworkGenesisHashByKey(key: string): string {
    const network = this.networkMap[key];

    return network && network.genesisHash;
  }

  getNetworkByKey(key: string): NetworkJson {
    return this.networkValues.find((network) => network.name.toLowerCase() === key.toLowerCase())!;
  }

  findNetworkKeyByChainId(_chainId?: string | null): [string | undefined, NetworkJson | undefined] {
    if (!_chainId) return [undefined, undefined];

    const rs = Object.entries(this.networkMap).find(([, chainInfo]) => chainInfo.chainId === _chainId);

    if (rs) return rs;
    else return [undefined, undefined];
  }

  saveSelectedNetworks() {
    storage.set({ selectedNetworks: this.selectedNetworks });
  }

  updateNetworkStatus(key: string, status: NETWORK_STATUS) {
    const networkKey = this.getNetworkByKey(key)?.name ?? '';

    if (this.networkMap[networkKey].networkStatus === status) return;

    this.networkMap[networkKey].networkStatus = status;

    this.updateNetworks();
  }

  public getActiveNetworks() {
    const networks = this.networkValues;
    const uniqNetworks = new Set<NetworkJson>();
    const selectedNetworks = Object.keys(this.selectedNetworks);
    const isAllNetworkPicked = selectedNetworks.some((address) => this.selectedNetworks[address] === ALL_NETWORKS);

    if (isAllNetworkPicked) return networks;

    selectedNetworks.forEach((address) => {
      const value = this.selectedNetworks[address];

      if (value === POPULAR_NETWORKS) {
        const popular = networks.filter((el) => el.rank !== undefined);
        popular.forEach((el) => uniqNetworks.add(el));

        return;
      }

      if (value === FAVORITE_NETWORKS) {
        const favorite = networks.filter((el) => el.favorite.length && el.favorite.includes(address));

        favorite.forEach((el) => uniqNetworks.add(el));

        return;
      }

      const singleNetwork = networks.find((network) => network.name === value);

      if (singleNetwork) uniqNetworks.add(singleNetwork);
    });
    console.info(Array.from(uniqNetworks), 'set this to Active');

    return Array.from(uniqNetworks);
  }
}
