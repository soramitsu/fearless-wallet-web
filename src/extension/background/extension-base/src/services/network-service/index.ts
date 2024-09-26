import axios from 'axios';
import NetworkMapStore from '@extension-base/stores/NetworkMap';
import SelectedNetworkStore from '@extension-base/stores/SelectedNetworkStore';
import { type NetworkJson } from '@extension-base/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { EvmApiHandler } from '@extension-base/services/network-service/handlers/EvmApiHandler';
import { SubstrateApiHandler } from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import { type KeyringService } from '@extension-base/services';
import { type ApiMap } from '@extension-base/background/types/types';
import { logger as createLogger } from '@polkadot/util';
import type State from '@extension-base/background/handlers/State';
import {
  isEthereumNetwork,
  isNativeEVMNetwork,
} from '@/extension/background/extension-base/src/background/handlers/utils';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { URLS } from '@/consts/urls';
import { isSameString } from '@/helpers';
import { type NetworkName } from '@/interfaces';

export type NetworkMap = Record<string, NetworkJson>;

export class NetworkService {
  private readonly logger = createLogger('Network_Service');
  readonly networkMapStore = new NetworkMapStore(); // persist custom networkMap by user
  readonly selectedNetworksStore = new SelectedNetworkStore();
  public networksGithub: NetworkJson[] = []; // networks from github
  public networkMap: NetworkMap = {}; // mapping to networkMapStore, for uses in background
  public selectedNetworks: Record<string, string> = {};
  evmApiHandler = new EvmApiHandler(this.networkMap);
  substrateApiHandler: SubstrateApiHandler;

  constructor(readonly keyringService: KeyringService, state: State) {
    this.substrateApiHandler = new SubstrateApiHandler(this, state);

    this.selectedNetworksStore.get(
      'selectedNetworks',
      (selectedNetworks) => (this.selectedNetworks = selectedNetworks ?? {})
    );
  }

  get networkValues() {
    return Object.values(this.networkMap);
  }

  get evmNativeNetworkValues() {
    return this.networkValues.filter(({ name }) => isNativeEVMNetwork(name));
  }

  get assetsMap() {
    return this.networkValues.map(({ assets }) => assets).flat();
  }

  get getApiMap(): ApiMap {
    return {
      substrate: this.substrateApiHandler.api,
      evm: this.evmApiHandler.api,
    };
  }

  public async initNetworkMap() {
    this.logger.log('Init Network Map');

    const { data: networks } = await axios.get<NetworkJson[]>(URLS.CHAINS);

    const networksFromStorage = await this.getStoredNetworks();

    this.networksGithub = networks;

    this.networksGithub
      .filter((el) => {
        if (el.disabled) return false;

        const isTestnet = !!el.options?.some((option) => isSameString(option, 'testnet'));

        if (process.env.VUE_APP_TEST_ONLY !== undefined) return isTestnet;

        if (process.env.NODE_ENV === 'production') return !isTestnet;

        return true;
      })
      .forEach((network) => {
        const [{ url: currentProvider }] = network.nodes;
        const providers: Record<string, string> = {};

        network.nodes.forEach(({ name, url }) => (providers[name] = url));

        const isEthereum = isEthereumNetwork(network.name);
        const favorite = networksFromStorage?.[network.name]?.favorite ?? [];

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

    Object.keys(this.networkMap).forEach((networkName) => {
      const isActiveNetwork = activeNetworks.some(({ name }) => isSameString(name, networkName));

      this.networkMap[networkName].active = isActiveNetwork;
    });

    this.keyringService.getSubstrateAccounts().forEach((el) => {
      //Migration from old network management
      if (!this.selectedNetworks[el.address]) this.selectedNetworks[el.address] = ALL_NETWORKS;
    });

    this.updateNetworkStore();
  }

  getStoredNetworks(): Promise<Record<string, NetworkJson> | undefined> {
    return new Promise((resolve) =>
      this.networkMapStore.get('NetworkMap', (accountsFromStorage) => resolve(accountsFromStorage))
    );
  }

  updateNetworkStore() {
    this.networkMapStore.set('NetworkMap', this.networkMap);
  }

  saveSelectedNetworks() {
    this.selectedNetworksStore.set('selectedNetworks', this.selectedNetworks);
  }

  getNetworkJson(networkNameOrChainId: NetworkName): NetworkJson {
    return this.networkValues.find(({ name }) => isSameString(name, networkNameOrChainId))!;
  }

  findNetworkJsonByChainId(_chainId?: string | null): NetworkJson | undefined {
    return this.networkValues.find(({ chainId }) => isSameString(chainId, _chainId));
  }

  updateNetworkStatus(networkName: string, status: NETWORK_STATUS) {
    const networkKey = this.getNetworkJson(networkName)?.name ?? '';

    if (this.networkMap[networkKey].networkStatus === status) return;

    this.networkMap[networkKey].networkStatus = status;

    this.updateNetworkStore();
  }

  public getActiveNetworks() {
    const entries = Object.entries(this.selectedNetworks);
    const isAll = entries.some(([, value]) => value === ALL_NETWORKS);

    if (isAll) return this.networkValues;

    const uniqNetworks = new Set<NetworkJson>();

    entries.forEach(([address, value]) => {
      if (value === POPULAR_NETWORKS) {
        const popular = this.networkValues.filter((el) => el.rank !== undefined);

        popular.forEach((el) => uniqNetworks.add(el));
      } else if (value === FAVORITE_NETWORKS) {
        const favorite = this.networkValues.filter((el) => el.favorite.length && el.favorite.includes(address));

        favorite.forEach((el) => uniqNetworks.add(el));
      } else {
        const singleNetwork = this.networkValues.find((network) => network.name === value);

        if (singleNetwork) uniqNetworks.add(singleNetwork);
      }
    });

    this.logger.log(
      'Set active networks',
      Array.from(uniqNetworks).map(({ name }) => name)
    );

    return Array.from(uniqNetworks);
  }

  public initNetworkApis() {
    const activeNetworks = this.networkValues.filter(({ active }) => active);

    for (const network of activeNetworks) {
      const { name } = network;

      if (isNativeEVMNetwork(name)) {
        if (!this.evmApiHandler.api[name] || !this.evmApiHandler.api[name].api?.ready)
          this.evmApiHandler.initEvmApi(network);
      } else {
        const initSubstrateApis = () => {
          this.resetApiRetries();

          this.substrateApiHandler.initApi(network);
        };

        if (this.substrateApiHandler.api[name])
          this.substrateApiHandler.api[name].api?.isReadyOrError.catch(initSubstrateApis);
        else initSubstrateApis();
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
    const { name, currentProvider, chain, paraId, customNodes, isEthereum } = data;

    if (name in this.networkMap) {
      const network = this.networkMap[name];
      //make network active if it was disabled previously
      network.active = true;
      // update provider for existed network
      network.customNodes = customNodes;

      if (currentProvider !== network.currentProvider && currentProvider) network.currentProvider = currentProvider;

      network.chain = chain;
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

      if (isEthereum && isNativeEVMNetwork(name)) this.evmApiHandler.initEvmApi(data);
      else this.substrateApiHandler.initApi(data);
    }

    this.updateNetworkStore();

    callback?.();

    return true;
  }

  public disableNetworkMap(networkKey: string, callback?: () => void): boolean {
    //if it's already disconnected then return true
    if (this.networkMap[networkKey].networkStatus === NETWORK_STATUS.DISCONNECTED) return true;

    const lowerKey = networkKey.toLowerCase();

    if (this.evmApiHandler.api[lowerKey]) {
      this.evmApiHandler.api[lowerKey].api?.destroy();

      delete this.evmApiHandler.api[lowerKey].api;
    } else {
      this.substrateApiHandler.api[networkKey].provider?.disconnect();

      delete this.substrateApiHandler.api[lowerKey].api;
    }

    this.networkMap[networkKey].active = false;
    this.updateNetworkStatus(networkKey, NETWORK_STATUS.DISCONNECTED);

    this.updateNetworkStore();

    callback?.();

    return true;
  }
}
