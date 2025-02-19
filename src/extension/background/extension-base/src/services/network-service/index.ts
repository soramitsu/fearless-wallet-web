import axios from 'axios';
import NetworkMapStore from '@extension-base/stores/NetworkMap';
import SelectedNetworkStore from '@extension-base/stores/SelectedNetworkStore';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { EvmApiHandler } from '@extension-base/services/network-service/handlers/EvmApiHandler';
import { SubstrateApiHandler } from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import { logger as createLogger } from '@polkadot/util';
import { TonApiHandler } from './handlers/TonApiHandler';
import type { KeyringService } from '@extension-base/services';
import type { ApiMap } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type State from '@extension-base/background/handlers/State';
import { WalletEcosystem, type NetworkName } from '@/interfaces';
import { isEthereumNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { URLS } from '@/consts/urls';
import { isSameString } from '@/helpers';
import { IS_PRODUCTION, IS_TEST_ONLY } from '@/consts/global';

export type NetworkMap = Record<string, NetworkJson>;

export class NetworkService {
  private readonly logger = createLogger('Network_Service');
  readonly networkMapStore = new NetworkMapStore(); // persist custom networkMap by user
  readonly selectedNetworksStore = new SelectedNetworkStore(null);
  networksGithub: NetworkJson[] = []; // networks from github
  networkMap: NetworkMap = {}; // mapping to networkMapStore, for uses in background
  selectedNetworks: Record<string, string> = {};
  tonApiHandler: TonApiHandler;
  evmApiHandler = new EvmApiHandler(this.networkMap);
  substrateApiHandler: SubstrateApiHandler;

  constructor(readonly keyringService: KeyringService, state: State) {
    this.substrateApiHandler = new SubstrateApiHandler(this, state);
    this.tonApiHandler = new TonApiHandler(state);

    this.selectedNetworksStore.get('selectedNetworks', (selectedNetworks) => {
      this.selectedNetworks = selectedNetworks ?? {};
    });
  }

  get networkValues() {
    return Object.values(this.networkMap);
  }

  get activeNetworkByEcosystem() {
    return this.networkValues.reduce(
      (result, item) => {
        if (!item.active) return result;

        const networkLower = item.name.toLowerCase();

        if (item.ecosystem === 'ethereum') {
          result.evm.push(item);
          result.evmList.push(networkLower);
        } else if (item.ecosystem === 'ton') {
          result.ton.push(item);
          result.tonList.push(networkLower);
        } else if (item.ecosystem === 'substrate' || item.ecosystem === 'ethereumBased') {
          result.substrate.push(item);
          result.substrateList.push(networkLower);
        }

        return result;
      },
      {
        substrate: [] as NetworkJson[],
        evm: [] as NetworkJson[],
        ton: [] as NetworkJson[],
        substrateList: [] as NetworkName[],
        evmList: [] as NetworkName[],
        tonList: [] as NetworkName[],
      }
    );
  }

  get assetsMap() {
    return this.networkValues.flatMap(({ assets }) => assets);
  }

  get getApiMap(): ApiMap {
    return {
      substrate: this.substrateApiHandler.api,
      evm: this.evmApiHandler.api,
      ton: this.tonApiHandler.api,
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

        if (IS_TEST_ONLY) return isTestnet;

        if (IS_PRODUCTION) return !isTestnet;

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
          ecosystem: network.ecosystem,
          isEthereum,
          genesisHash: `0x${network.chainId}`,
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

    this.keyringService.getAllMainAccounts().forEach((el) => {
      //Migration from old network management
      if (!this.selectedNetworks[el.address]) this.selectedNetworks[el.address] = ALL_NETWORKS;
    });

    this.updateNetworkStore();
  }

  destroyApi(network: string) {
    const { ecosystem, name } = this.networkMap[network];

    if (ecosystem === 'ethereum') this.evmApiHandler.destroyApi(name);
    else if (ecosystem === 'ton') this.tonApiHandler.destroyApi(name);
    else this.substrateApiHandler.destroyApi(name);
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

  getActiveNetworks() {
    const entries = Object.entries(this.selectedNetworks);
    const uniqNetworks = new Set<NetworkJson>();

    const allMainAccounts = this.keyringService.getAllMainAccounts();

    entries.forEach(([address, value]) => {
      const account = allMainAccounts.find(({ address: _address }) => isSameString(_address, address));

      if (!account) return;

      const isSubstrateAddress = account?.meta.walletEcosystem === WalletEcosystem.Substrate;

      if (value === ALL_NETWORKS) {
        this.networkValues.forEach((network) => {
          if (isSubstrateAddress && network.ecosystem !== 'ton') return uniqNetworks.add(network);

          if (!isSubstrateAddress && network.ecosystem === 'ton') uniqNetworks.add(network);
        });

        return;
      }

      if (value === POPULAR_NETWORKS) {
        this.networkValues.forEach((network) => {
          if (!network.rank) return;

          if (isSubstrateAddress && network.ecosystem !== 'ton') return uniqNetworks.add(network);

          if (!isSubstrateAddress && network.ecosystem === 'ton') uniqNetworks.add(network);
        });

        return;
      }

      if (value === FAVORITE_NETWORKS) {
        this.networkValues.forEach((network) => {
          if (network.favorite.includes(address)) return;

          if (isSubstrateAddress && network.ecosystem !== 'ton') return uniqNetworks.add(network);

          if (!isSubstrateAddress && network.ecosystem === 'ton') uniqNetworks.add(network);
        });

        return;
      }

      const singleNetwork = this.networkValues.find((network) => isSameString(network.name, value));

      if (singleNetwork) uniqNetworks.add(singleNetwork);
    });

    this.logger.log(
      'Set active networks',
      Array.from(uniqNetworks).map(({ name }) => name)
    );

    return Array.from(uniqNetworks);
  }

  initNetworkApis() {
    this.activeNetworkByEcosystem.evm.forEach((network) => {
      if (!this.evmApiHandler.api[network.name] || !this.evmApiHandler.api[network.name].api?.ready)
        this.evmApiHandler.initEvmApi(network);
    });

    this.activeNetworkByEcosystem.ton.forEach((network) => {
      if (!this.tonApiHandler.api[network.name]) this.tonApiHandler.initApi(network);
    });

    this.activeNetworkByEcosystem.substrate.forEach((network) => {
      const initSubstrateApis = () => this.substrateApiHandler.initApi(network);

      if (this.substrateApiHandler.api[network.name])
        this.substrateApiHandler.api[network.name].api?.isReadyOrError.catch(initSubstrateApis);
      else initSubstrateApis();
    });
  }

  upsertNetworkMap(networkJson: NetworkJson) {
    const { name, currentProvider, customNodes, ecosystem } = networkJson;

    if (name in this.networkMap) {
      this.networkMap[name].active = true;
      this.networkMap[name].customNodes = customNodes;

      if (currentProvider !== this.networkMap[name].currentProvider && currentProvider)
        this.networkMap[name].currentProvider = currentProvider;
    } else this.networkMap[name] = networkJson;

    this.updateNetworkStore();

    if (!this.networkMap[name].active) return;

    if (ecosystem === 'ethereum') this.evmApiHandler.initEvmApi(networkJson);
    else if (ecosystem === 'ton') this.tonApiHandler.initApi(networkJson);
    else {
      this.substrateApiHandler.api[name].api?.disconnect();
      this.substrateApiHandler.api[name].provider?.disconnect();

      this.substrateApiHandler.initApi(networkJson);
    }
  }

  disableNetworkMap(networkKey: string) {
    //if it's already disconnected then return true
    if (this.networkMap[networkKey].networkStatus === NETWORK_STATUS.DISCONNECTED) return true;

    this.destroyApi(networkKey);

    this.networkMap[networkKey].active = false;

    this.updateNetworkStatus(networkKey, NETWORK_STATUS.DISCONNECTED);

    this.updateNetworkStore();
  }
}
