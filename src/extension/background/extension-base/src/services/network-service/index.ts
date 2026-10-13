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
import {
  createAuthoritativeDiscoveryRegistryNetworks,
  mergeUniversalWalletRegistryNetworks,
} from '@/util/universalWalletRegistryNetworks';
import { withoutUntrustedPrices } from '@/portfolio/untrustedAssets';
import { withDeadline } from '@/bootstrap/boundedAttempts';

export type NetworkMap = Record<string, NetworkJson>;

type NetworkPreferences = Pick<NetworkJson, 'favorite' | 'currentProvider' | 'customNodes' | 'customProviders' | 'isManual'>;

function preferences(network: NetworkJson): NetworkPreferences {
  return { favorite: network.favorite, currentProvider: network.currentProvider, customNodes: network.customNodes,
    customProviders: network.customProviders, isManual: network.isManual };
}

function readableSettings(stored: NetworkMap | undefined): NetworkMap {
  if (stored !== undefined && (!stored || typeof stored !== 'object' || Array.isArray(stored))) {
    throw new Error('Network settings are unavailable');
  }
  return stored ?? {};
}

// Registry/cache rows are rebuildable data. One malformed row must not stop wallets opening.
function usableNetwork(value: unknown): value is NetworkJson {
  if (!value || typeof value !== 'object') return false;
  const row = value as NetworkJson;
  return typeof row.name === 'string' && !!row.name && typeof row.chainId === 'string' && !!row.chainId &&
    (row.options === undefined || (Array.isArray(row.options) && row.options.every((option) => typeof option === 'string'))) &&
    ['substrate', 'ethereumBased', 'ethereum', 'ton', 'bitcoin', 'solana', 'iroha'].includes(row.ecosystem) &&
    Array.isArray(row.assets) && row.assets.every((asset) => asset && typeof asset.id === 'string' &&
      typeof asset.symbol === 'string' && Number.isFinite(asset.precision)) &&
    Array.isArray(row.nodes) && (row.nodes.length > 0 || ['bitcoin', 'solana', 'iroha'].includes(row.ecosystem)) &&
    row.nodes.every((node) => node &&
      typeof node.name === 'string' && typeof node.url === 'string' && !!node.url);
}

export class NetworkService {
  private registryAvailable = false;
  private cacheReadable = false;
  private registryAttemptAt = 0;
  private registryInitialization?: Promise<void>;
  private registryRetry?: Promise<boolean>;
  private preferenceRevision = 0;
  private readonly networkPreferenceRevision: Record<string, number> = {};
  private readonly logger = createLogger('Network_Service');
  readonly networkMapStore = new NetworkMapStore(); // persist custom networkMap by user
  readonly selectedNetworksStore = new SelectedNetworkStore(null);
  networksGithub: NetworkJson[] = []; // networks from github
  networkMap: NetworkMap = {}; // mapping to networkMapStore, for uses in background
  selectedNetworks: Record<string, string> = {};
  tonApiHandler: TonApiHandler;
  evmApiHandler = new EvmApiHandler(this.networkMap);
  substrateApiHandler: SubstrateApiHandler;

  constructor(
    readonly keyringService: KeyringService,
    state: State,
    private readonly onAuthoritativeRegistryUpdated: () => void = () => undefined
  ) {
    this.substrateApiHandler = new SubstrateApiHandler(this, state);
    this.tonApiHandler = new TonApiHandler(state);

    this.selectedNetworksStore.get('selectedNetworks', (selectedNetworks) => {
      this.selectedNetworks = selectedNetworks ?? {};
    });
  }

  get networkValues() {
    return Object.values(this.networkMap);
  }

  /** Maintained remote + bundled registries, excluding arbitrary custom networks. */
  get authoritativeDiscoveryNetworks() {
    return createAuthoritativeDiscoveryRegistryNetworks(this.networksGithub);
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
        } else if (item.ecosystem === 'solana') {
          result.solana.push(item);
          result.solanaList.push(networkLower);
        } else if (item.ecosystem === 'bitcoin') {
          result.bitcoin.push(item);
          result.bitcoinList.push(networkLower);
        } else if (item.ecosystem === 'iroha') {
          result.iroha.push(item);
          result.irohaList.push(networkLower);
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
        solana: [] as NetworkJson[],
        bitcoin: [] as NetworkJson[],
        iroha: [] as NetworkJson[],
        substrateList: [] as NetworkName[],
        evmList: [] as NetworkName[],
        tonList: [] as NetworkName[],
        solanaList: [] as NetworkName[],
        bitcoinList: [] as NetworkName[],
        irohaList: [] as NetworkName[],
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

  public initNetworkMap(): Promise<void> {
    this.registryInitialization ??= this.loadNetworkMap().finally(() => { this.registryInitialization = undefined; });
    return this.registryInitialization;
  }

  retryRegistryIfNeeded(): Promise<boolean> {
    if (this.registryRetry) return this.registryRetry;
    if ((this.registryAvailable && this.cacheReadable) || Date.now() - this.registryAttemptAt < 60000) return Promise.resolve(false);
    this.registryRetry = this.initNetworkMap().then(() => {
      if (this.registryAvailable) this.initNetworkApis();
      return this.registryAvailable;
    }).finally(() => { this.registryRetry = undefined; });
    return this.registryRetry;
  }

  private async loadNetworkMap() {
    const hadReadableCache = this.cacheReadable;
    const preferenceRevision = this.preferenceRevision;
    this.registryAttemptAt = Date.now();
    this.logger.log('Init Network Map');

    const networksFromStorage = await this.getStoredNetworks();
    let remote = false;
    let networks: NetworkJson[];
    try {
      const { data } = await axios.get<unknown>(URLS.CHAINS, { timeout: 10000 });
      const rows = Array.isArray(data) ? data.filter(usableNetwork).filter((network) => network.nodes.length > 0) : [];
      if (!rows.length) throw new Error('No usable registry networks');
      networks = rows.map((network) => withoutUntrustedPrices(network));
      this.networksGithub = networks;
      remote = true;
    } catch (error) {
      console.warn('Network registry unavailable; using cached and bundled networks', error);
      // Cached custom networks are usable locally but never become an authoritative discovery registry.
      networks = Object.values({ ...networksFromStorage, ...this.networkMap }).filter(usableNetwork)
        .map((network) => withoutUntrustedPrices(network));
    }
    this.registryAvailable = remote;

    networks
      .filter((el) => {
        if (el.disabled) return false;

        const isTestnet = !!el.options?.some((option) => isSameString(option, 'testnet'));

        if (IS_TEST_ONLY) return isTestnet;

        if (IS_PRODUCTION) return !isTestnet;

        return true;
      })
      .forEach((network) => {
        const currentProvider = network.nodes[0]?.url ?? '';
        const providers: Record<string, string> = {};

        network.nodes.forEach(({ name, url }) => (providers[name] = url));

        const isEthereum = isEthereumNetwork(network.name);
        // A refresh must not roll back settings edited while its HTTP request was pending.
        const useCurrent = hadReadableCache || this.networkPreferenceRevision[network.name] > preferenceRevision;
        const saved = (useCurrent ? this.networkMap[network.name] : undefined) ?? networksFromStorage?.[network.name];
        const favorite = Array.isArray(saved?.favorite) ? saved.favorite.filter((value) => typeof value === 'string') : [];

        this.networkMap[network.name] = {
          ...network,
          key: network.name,
          ecosystem: network.ecosystem,
          isEthereum,
          genesisHash: `0x${network.chainId}`,
          active: true,
          customNodes: saved?.customNodes ?? [],
          customProviders: saved?.customProviders ?? {},
          isManual: saved?.isManual,
          favorite,
          providers,
          currentProvider: saved?.currentProvider || currentProvider,
        };
      });

    if (!hadReadableCache) {
      // A recovered cache may contain settings for bundled chains absent from the remote response.
      for (const [name, saved] of Object.entries(networksFromStorage ?? {})) {
        if (this.networkPreferenceRevision[name] > preferenceRevision) continue;
        const existing = this.networkMap[name];
        if (!existing) continue;
        existing.favorite = saved.favorite ?? existing.favorite;
        existing.currentProvider = saved.currentProvider || existing.currentProvider;
        existing.customNodes = saved.customNodes ?? existing.customNodes;
        existing.customProviders = saved.customProviders ?? existing.customProviders;
        existing.isManual = saved.isManual ?? existing.isManual;
      }
    }
    const registryPreferences = { ...networksFromStorage };
    for (const [name, network] of Object.entries(this.networkMap)) {
      if (hadReadableCache || this.networkPreferenceRevision[name] > preferenceRevision) registryPreferences[name] = network;
    }
    mergeUniversalWalletRegistryNetworks(this.networkMap, registryPreferences);

    const activeNetworks = this.getActiveNetworks();

    Object.keys(this.networkMap).forEach((networkName) => {
      const isActiveNetwork = activeNetworks.some(({ name }) => isSameString(name, networkName));

      this.networkMap[networkName].active = isActiveNetwork;
    });

    this.keyringService.getAllMainAccounts().forEach((el) => {
      //Migration from old network management
      if (!this.selectedNetworks[el.address]) this.selectedNetworks[el.address] = ALL_NETWORKS;
    });

    // Re-enable writes only after saved preferences have been rebased into the active map.
    this.cacheReadable = networksFromStorage !== undefined;
    // A remote failure must not replace a previously useful cache with a partial/offline catalog.
    if (remote && networksFromStorage !== undefined) this.updateNetworkStore();
    this.onAuthoritativeRegistryUpdated();
  }

  destroyApi(network: string) {
    const { ecosystem, name } = this.networkMap[network];

    if (ecosystem === 'ethereum') this.evmApiHandler.destroyApi(name);
    else if (ecosystem === 'ton') this.tonApiHandler.destroyApi(name);
    else if (ecosystem === 'bitcoin') return;
    else this.substrateApiHandler.destroyApi(name);
  }

  async getStoredNetworks(): Promise<Record<string, NetworkJson> | undefined> {
    try {
      const stored = await withDeadline(this.networkMapStore.getAndWait('NetworkMap'), 5000, 'Network cache read timed out');
      return Object.fromEntries(Object.values(stored ?? {}).filter(usableNetwork).map((network) => [network.name, network]));
    } catch (error) {
      this.cacheReadable = false;
      console.warn('Network cache unavailable; rebuilding network catalog', error);
      return undefined;
    }
  }

  updateNetworkStore() {
    // Status polling and connection callbacks also reach here. None may erase unread personal settings.
    if (!this.cacheReadable) return;
    const catalog = structuredClone(this.networkMap);
    // Background status/catalog writes never replace preferences committed by a concurrent user action.
    void this.networkMapStore.updateAndWait('NetworkMap', (stored) => {
      const current = readableSettings(stored);
      return { ...current, ...Object.fromEntries(Object.entries(catalog).map(([name, network]) => [name,
        { ...network, ...(usableNetwork(current[name]) ? preferences(current[name]) : {}) },
      ])) };
    }, () => this.networkMapStore.getSubject().next(this.networkMap), false)
      .catch((error) => console.warn('Network catalog could not be saved', error));
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
      const isTonAddress = account?.meta.walletEcosystem === WalletEcosystem.Ton;
      const isSolanaAddress = account?.meta.walletEcosystem === WalletEcosystem.Solana;
      const isBitcoinAddress = account?.meta.walletEcosystem === WalletEcosystem.Bitcoin;
      const isIrohaAddress = account?.meta.walletEcosystem === WalletEcosystem.Iroha;

      if (value === ALL_NETWORKS) {
        this.networkValues.forEach((network) => {
          if (
            isSubstrateAddress &&
            network.ecosystem !== 'ton' &&
            network.ecosystem !== 'solana' &&
            network.ecosystem !== 'bitcoin' &&
            network.ecosystem !== 'iroha'
          )
            return uniqNetworks.add(network);

          if (isTonAddress && network.ecosystem === 'ton') uniqNetworks.add(network);
          if (isSolanaAddress && network.ecosystem === 'solana') uniqNetworks.add(network);
          if (isBitcoinAddress && network.ecosystem === 'bitcoin') uniqNetworks.add(network);
          if (isIrohaAddress && network.ecosystem === 'iroha') uniqNetworks.add(network);
        });

        return;
      }

      if (value === POPULAR_NETWORKS) {
        this.networkValues.forEach((network) => {
          if (!network.rank) return;

          if (
            isSubstrateAddress &&
            network.ecosystem !== 'ton' &&
            network.ecosystem !== 'solana' &&
            network.ecosystem !== 'bitcoin' &&
            network.ecosystem !== 'iroha'
          )
            return uniqNetworks.add(network);

          if (isTonAddress && network.ecosystem === 'ton') uniqNetworks.add(network);
          if (isSolanaAddress && network.ecosystem === 'solana') uniqNetworks.add(network);
          if (isBitcoinAddress && network.ecosystem === 'bitcoin') uniqNetworks.add(network);
          if (isIrohaAddress && network.ecosystem === 'iroha') uniqNetworks.add(network);
        });

        return;
      }

      if (value === FAVORITE_NETWORKS) {
        this.networkValues.forEach((network) => {
          if (network.favorite.includes(address)) return;

          if (
            isSubstrateAddress &&
            network.ecosystem !== 'ton' &&
            network.ecosystem !== 'solana' &&
            network.ecosystem !== 'bitcoin' &&
            network.ecosystem !== 'iroha'
          )
            return uniqNetworks.add(network);

          if (isTonAddress && network.ecosystem === 'ton') uniqNetworks.add(network);
          if (isSolanaAddress && network.ecosystem === 'solana') uniqNetworks.add(network);
          if (isBitcoinAddress && network.ecosystem === 'bitcoin') uniqNetworks.add(network);
          if (isIrohaAddress && network.ecosystem === 'iroha') uniqNetworks.add(network);
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
      // Kept across calls: a provider proves its network once, not on every refresh.
      if (!this.tonApiHandler.api[network.name.toLowerCase()]) this.tonApiHandler.initApi(network);
    });

    this.activeNetworkByEcosystem.substrate.forEach((network) => {
      const initSubstrateApis = () => this.substrateApiHandler.initApi(network);

      if (this.substrateApiHandler.api[network.name])
        this.substrateApiHandler.api[network.name].api?.isReadyOrError.catch(initSubstrateApis);
      else initSubstrateApis();
    });
  }

  async upsertNetworkMap(networkJson: NetworkJson): Promise<void> {
    const requested = structuredClone(networkJson);
    if (!usableNetwork(requested)) throw new Error('Invalid network settings');
    const { name, currentProvider, customNodes, customProviders, isManual } = requested;
    const patch = { currentProvider, customNodes, customProviders, isManual };
    await this.persistPreferences(name, requested, () => patch);
    const network = this.networkMap[name];
    // Connection setup is best effort after the preference commit; it cannot undo the saved choice.
    try {
      if (network.ecosystem === 'ethereum') this.evmApiHandler.initEvmApi(network);
      else if (network.ecosystem === 'ton') this.tonApiHandler.initApi(network);
      else if (network.ecosystem === 'substrate' || network.ecosystem === 'ethereumBased') {
        const previous = this.substrateApiHandler.api[name.toLowerCase()];
        void previous?.api?.disconnect().catch(console.warn);
        void previous?.provider?.disconnect().catch(console.warn);
        await this.substrateApiHandler.initApi(network);
      }
    } catch (error) { console.warn('Saved network connection is unavailable', error); }
  }

  async toggleFavoriteNetwork(name: string, address: string): Promise<void> {
    const network = this.networkMap[name];
    if (!network) throw new Error('Network unavailable');
    await this.persistPreferences(name, network, (saved) => {
      const favorite = Array.isArray(saved.favorite) ? saved.favorite : [];
      return { favorite: favorite.includes(address) ? favorite.filter((item) => item !== address) : [...favorite, address] };
    });
  }

  private async persistPreferences(
    name: string,
    catalog: NetworkJson,
    update: (saved: NetworkJson) => Partial<NetworkPreferences>
  ): Promise<void> {
    await this.networkMapStore.updateAndWait('NetworkMap', (stored) => {
      const current = readableSettings(stored);
      const saved = { ...catalog, ...(usableNetwork(current[name]) ? preferences(current[name]) : {}) };
      return { ...current, [name]: { ...current[name], ...saved, ...update(saved) } };
    }, (committed) => {
      const saved = committed[name];
      this.networkMap[name] = { ...(this.networkMap[name] ?? saved), ...preferences(saved) };
      this.networkPreferenceRevision[name] = ++this.preferenceRevision;
      this.networkMapStore.getSubject().next(this.networkMap);
    }, false);
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
