import { Subject } from 'rxjs';
import axios from 'axios';
import NetworkMapStore from '@extension-base/stores/NetworkMap';
import { type NetworkJson } from '@extension-base/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { storage } from '@extension-base/stores/Storage';
import { EvmApiHandler } from '@extension-base/services/network-service/handlers/EvmApiHandler';
import { SubstrateApiHandler } from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import { type KeyringService } from '@extension-base/services';
import { isEthereumNetwork, isRequireEvmAPI } from '@extension-base/background/utils/utils';
import { type ApiMap } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { URLS } from '@/consts/urls';

export class NetworkService {
  readonly keyringService: KeyringService;
  private networkMapSubject: Subject<Record<string, NetworkJson>>;
  readonly networkMapStore: NetworkMapStore; // persist custom networkMap by user
  public networksGithub: NetworkJson[] = []; // networks from github
  public networkMap: Record<string, NetworkJson> = {}; // mapping to networkMapStore, for uses in background
  public selectedNetworks: Record<string, string>;
  substrateApiHandler: SubstrateApiHandler;
  evmApiHandler: EvmApiHandler;

  constructor(state: State, keyringService: KeyringService) {
    this.keyringService = keyringService;
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

  public async initNetworkMap() {
    const { data: networks } = await axios.get<NetworkJson[]>(URLS.CHAINS);

    const networksFromStorage = await this.getStoredNetworks();

    this.networksGithub = networks;

    this.networksGithub
      .filter((el) => {
        if (el.disabled) return false;

        const isTestnet = !!el.options?.some((option) => option === 'testnet');

        if (process.env.VUE_APP_TEST_ONLY !== undefined) return isTestnet;

        if (process.env.NODE_ENV === 'production') return !isTestnet;

        return true;
      })
      .forEach((network) => {
        const [{ url: currentProvider }] = network.nodes;
        const providers: Record<string, string> = {};

        network.nodes.forEach(({ name, url }) => (providers[name] = url));

        const isEthereum = isEthereumNetwork(network.name);
        const networkFromStorage = networksFromStorage ? networksFromStorage[network.name] : undefined;

        const favorite = networkFromStorage && networkFromStorage.favorite ? networkFromStorage.favorite : [];

        this.networkMap[network.name] = {
          ...network,
          key: network.name,
          isEthereum,
          genesisHash: `0x${network.chainId}`,
          chainType: isEthereum ? 'ethereum' : 'substrate',
          active: true,
          customNodes: [],
          favorite,
          providers,
          currentProvider,
        };
      });

    const activeNetworks = this.getActiveNetworks();

    Object.keys(this.networkMap).forEach((key) => {
      const isExists = activeNetworks.some(({ name }) => name === key);

      this.networkMap[key].active = isExists;
    });

    this.keyringService.getSubstrateAccounts().forEach((el) => {
      //Migration from old network management
      if (!this.selectedNetworks[el.address]) this.selectedNetworks[el.address] = ALL_NETWORKS;
    });

    this.updateNetworkStore();
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

  public initNetworkApis() {
    const activeNetworks = this.networkValues.filter(({ active }) => active);

    for (const network of activeNetworks) {
      const { name, isEthereum } = network;

      if (isEthereum && isRequireEvmAPI(name)) {
        if (!this.evmApiHandler.api[name] || !this.evmApiHandler.api[name].api.ready)
          this.evmApiHandler.initEvmApi(network);
      } else {
        const initSubstrateApies = () => {
          this.resetApiRetries();

          this.substrateApiHandler.initApi(network);
        };

        if (this.substrateApiHandler.api[name]) {
          this.substrateApiHandler.api[name].api?.isReadyOrError.catch(initSubstrateApies);
        } else initSubstrateApies();
      }
    }
  }

  resetApiRetries() {
    Object.values(this.substrateApiHandler.api).forEach((api) => {
      api.nodeIndex = 0;
      api.apiRetry = 0;
    });
  }

  public upsertNetworkMap(data: NetworkJson, callback?: () => void): boolean {
    const { name, currentProvider, chain, paraId, decimals, customNodes, isEthereum } = data;

    if (name in this.networkMap) {
      const network = this.networkMap[name];
      //make network active if it was disabled previously
      network.active = true;
      // update provider for existed network
      network.customNodes = customNodes;

      if (currentProvider !== network.currentProvider && currentProvider) network.currentProvider = currentProvider;

      network.chain = chain;

      if (decimals) network.decimals = decimals;

      network.paraId = paraId;
    } else {
      // insert
      this.networkMap[name] = data;
    }

    if (this.networkMap[name].active) {
      // update API map if network is active
      if (name in this.substrateApiHandler.api) {
        this.substrateApiHandler.api[name].api?.disconnect();
        this.substrateApiHandler.api[name].provider?.disconnect();
        delete this.substrateApiHandler.api[name];
      }

      if (isEthereum && name in this.evmApiHandler.api) delete this.evmApiHandler.api[name];

      if (isEthereum && isRequireEvmAPI(name)) this.evmApiHandler.initEvmApi(data);
      else this.substrateApiHandler.initApi(data);
    }

    this.updateNetworks();

    callback && callback();

    return true;
  }

  public disableNetworkMap(networkKey: string, callback?: () => void): boolean {
    //if it's already disconnected then return true
    if (this.networkMap[networkKey].networkStatus === NETWORK_STATUS.DISCONNECTED) return true;

    if (this.networkMap[networkKey]?.isEthereum) delete this.evmApiHandler.api[networkKey];
    else delete this.substrateApiHandler.api[networkKey];

    this.networkMap[networkKey].active = false;
    this.networkMap[networkKey].networkStatus = NETWORK_STATUS.DISCONNECTED;

    this.updateNetworks();

    callback && callback();

    return true;
  }
}
