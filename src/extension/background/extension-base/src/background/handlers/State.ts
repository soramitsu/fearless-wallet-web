import { BehaviorSubject, Subject } from 'rxjs';
import { addMetadata } from '@polkadot/extension-chains';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { assert } from '@polkadot/util';
import { accounts } from '@subwallet/ui-keyring/observable/accounts';
import {
  EventService,
  OnboardingService,
  KeyringService,
  StakingService,
  PoolsService,
  NetworkService,
  RequestService,
  WalletConnectService,
  NftService,
  GoogleService,
  WalletConnectDAppService,
  SubscriptionService,
  CronService,
  ScamService,
  PricesService,
  TimeoutService,
  AssetDiscoverySweepService,
  canScanSubstrateBackedDiscoveryNetwork,
  resolveAssetDiscoveryEvmAddress,
  ActionCapabilityService,
  SoraDisclaimerService,
  IrohaConnectService,
} from '@extension-base/services';
import { api as apiSora } from '@sora-substrate/util';
import { storage } from '@extension-base/stores/Storage';
import axios from 'axios';
import { EXTENSION_HOSTNAME, EXTENSION_ID } from '@extension-base/const';
import { KeyringLockService } from '@extension-base/services/keyring-service/KeyringLock';
import EvmContractService from '../../services/evm-contract-service';
import { HistoryService } from '../../services/history-service';
import type { CurrentAccountInfo, CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import type {
  ServiceInfo,
  RequestRpcSend,
  RequestRpcSubscribe,
  RequestRpcUnsubscribe,
  ResponseRpcListProviders,
  Port,
  IState,
  ActiveTabAuthorizeStatus,
  Providers,
  AuthUrlInfo,
  AuthUrls,
  RequestUpdateCurrentAccount,
} from '@extension-base/background/types/types';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import type { JsonRpcResponse, ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';
import type { SoraFees, XcmLocations, XcmFees, NetworkName } from '@/interfaces';
import type { BitcoinNetworkKind } from '@/util/bitcoin';
import BalanceService from '@/extension/background/extension-base/src/services/balance-service';
import { WalletEcosystem } from '@/interfaces';
import { stripUrl, withErrorLog } from '@/extension/background/extension-base/src/background/helpers';
import { isEthereumNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import { URLS } from '@/consts/urls';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { isSameString } from '@/helpers';
import { encodeIrohaI105Address, resolveCanonicalIrohaAddressNetwork, type IrohaNetworkInput } from '@/util/iroha';

type Wallet = {
  address: string;
  ethereumAddress: string;
  bitcoinAddress?: string;
  bitcoinTestnetAddress?: string;
  solanaAddress?: string;
  irohaAddress?: string;
  irohaPublicKeyHex?: string;
};

export default class State {
  private ready = false;
  injectedProviders: Map<Port, ProviderInterface> = new Map();
  providers: Providers = {};
  serviceInfoSubject = new Subject<ServiceInfo>();
  xcmFees: XcmFees = [];
  xcmLocations: XcmLocations = [];
  soraFees: BehaviorSubject<SoraFees> = new BehaviorSubject<SoraFees>(apiSora.NetworkFee);
  currentTabStatus: ActiveTabAuthorizeStatus = {
    isAuthorize: false,
    authorizeAccountsCount: 0,
    dAppName: '',
  };

  onboardingService = new OnboardingService();
  eventService = new EventService();
  evmContractService = new EvmContractService();
  keyringService = new KeyringService(this.eventService);
  networkService = new NetworkService(this.keyringService, this, () => {
    if (this.ready) void this.assetDiscoverySweepService.runIfDue();
  });
  requestService = new RequestService(this.keyringService, this);
  walletConnectService = new WalletConnectService(this, this.requestService);
  walletConnectDappService = new WalletConnectDAppService(this);
  irohaConnectService = new IrohaConnectService(this, {
    onStateChange: (snapshot, previous) => {
      const isApproval = snapshot.phase === 'session-approval' || snapshot.phase === 'request-approval';
      const wasApproval = previous.phase === 'session-approval' || previous.phase === 'request-approval';

      if (isApproval !== wasApproval) this.requestService.updateIcon(!isApproval);
      if (snapshot.phase === 'request-approval' && previous.phase !== 'request-approval') {
        this.requestService.popupOpen('/fearless/settings/iroha-connect');
      }
    },
  });
  balanceService = new BalanceService(this);
  assetDiscoverySweepService = new AssetDiscoverySweepService({
    getRegistryNetworks: () => this.networkService.authoritativeDiscoveryNetworks,
    scanNetwork: (network) => this.scanDiscoveryNetwork(network),
    readState: async () => (await storage.get(['assetDiscoverySweep'])).assetDiscoverySweep,
    writeState: async (assetDiscoverySweep) => storage.set({ assetDiscoverySweep }),
  });
  actionCapabilityService = new ActionCapabilityService({
    read: async () => (await storage.get(['actionCapabilities'])).actionCapabilities,
    write: async (actionCapabilities) => storage.set({ actionCapabilities }),
  });
  soraDisclaimerService = new SoraDisclaimerService({
    read: async () => (await storage.get(['soraDisclaimerAcceptance'])).soraDisclaimerAcceptance,
    write: async (soraDisclaimerAcceptance) => storage.set({ soraDisclaimerAcceptance }),
  });
  pricesService = new PricesService(this);
  nftService = new NftService(this);
  stakingService = new StakingService(this);
  poolsService = new PoolsService(this);
  googleService = new GoogleService();
  cronService = new CronService(this);
  scamService = new ScamService(this);
  subscriptionService = new SubscriptionService(this);
  timeoutService = new TimeoutService(this);
  keyringLockService = new KeyringLockService(this);
  historyService = new HistoryService(this);

  constructor() {
    this.injectFromStorage();
    this.init();
  }

  get authSubject() {
    return this.requestService.authSubject;
  }

  get getSubstrateApiMap() {
    return this.networkService.substrateApiHandler.api;
  }

  get getEvmApiMap() {
    return this.networkService.evmApiHandler.api;
  }

  get getTonApiMap() {
    return this.networkService.tonApiHandler.api;
  }

  get currentAccount() {
    return this.keyringService.currentAccountSubject.value;
  }

  getEvmApi(key: string) {
    return this.getEvmApiMap[key.toLowerCase()];
  }

  getFromStorage(key: (keyof IState)[]) {
    return storage.get(key);
  }

  isReady() {
    return this.ready;
  }

  async injectFromStorage() {
    const { injectedProviders, providers } = await this.getFromStorage(['injectedProviders', 'providers']);

    if (injectedProviders) this.injectedProviders = new Map(injectedProviders);
    if (providers) this.providers = providers;
  }

  updateCurrentTabsUrl([tab]: chrome.tabs.Tab[]) {
    if (!tab || !tab.url) {
      this.currentTabStatus = {
        isAuthorize: false,
        authorizeAccountsCount: 0,
        dAppName: '',
      };

      return;
    }

    const url = new URL(tab.url);
    const isSelf = url.hostname === EXTENSION_ID || url.hostname === EXTENSION_HOSTNAME;
    const tabHostName = isSelf ? 'header.currentExtensionPage' : url.hostname;
    const tabAuthKey = isSelf ? null : stripUrl(tab.url);

    const cb = () => (authUrls: AuthUrls) => {
      const auth = tabAuthKey ? authUrls[tabAuthKey] : undefined;
      const isAuthorize = auth?.isAllowed === true;

      this.currentTabStatus = {
        isAuthorize,
        authorizeAccountsCount: isAuthorize ? auth.authorizedAccounts.length : 0,
        dAppName: tabHostName,
      };
    };

    this.requestService.getAuthorize(cb);
  }

  async onInstall() {
    if (this.currentAccount) {
      this.setCurrentAccount(this.currentAccount);

      return;
    }

    const allAccounts = this.keyringService.getAllMainAccounts();

    if (allAccounts.length) {
      const [
        {
          address,
          meta: {
            name,
            ethereumAddress,
            isMobile,
            bitcoinAddress,
            bitcoinTestnetAddress,
            solanaAddress,
            irohaAddress,
            irohaPublicKeyHex,
            walletEcosystem,
          },
        },
      ] = allAccounts;

      this.setCurrentAccount({
        address,
        name: name!,
        ethereumAddress: ethereumAddress!,
        bitcoinAddress: bitcoinAddress as string | undefined,
        bitcoinTestnetAddress: bitcoinTestnetAddress as string | undefined,
        solanaAddress: solanaAddress as string | undefined,
        irohaAddress: irohaAddress as string | undefined,
        irohaPublicKeyHex: irohaPublicKeyHex as string | undefined,
        isMobile: isMobile!,
        walletEcosystem: walletEcosystem!,
      });

      return;
    }

    this.setCurrentAccount(null);
  }

  async getAuthInfo(url: string, fromList?: AuthUrls): Promise<AuthUrlInfo | undefined> {
    const auths = await this.requestService.getAuthList();
    const authList = fromList || auths;
    const shortenUrl = stripUrl(url);

    return authList[shortenUrl];
  }

  disableNetworkMap(networkKey: string) {
    this.networkService.disableNetworkMap(networkKey);

    this.updateServiceInfo();

    this.requestService.getAuthorize((data) => this.requestService.setAuthorize(data));
  }

  updateServiceInfo() {
    this.serviceInfoSubject.next({
      networkMap: this.networkService.networkMap,
      apiMap: this.networkService.getApiMap,
      currentAccountInfo: this.currentAccount,
    });
  }

  async setFavoriteNetwork(networkName: string): Promise<void> {
    const network = this.networkService.networkMap[networkName];
    const currentAccount = this.currentAccount;

    if (!currentAccount) return;

    const addressIndex = network.favorite.findIndex((address) => address === currentAccount.address);

    if (addressIndex !== -1) network.favorite.splice(addressIndex, 1);
    else network.favorite.push(currentAccount.address);
  }

  async setActiveNetworks(type: string) {
    if (!this.currentAccount) return;

    if (this.networkService.selectedNetworks[this.currentAccount.address] === type) return;

    this.networkService.selectedNetworks[this.currentAccount.address] = type;

    const activeNetworks = this.networkService.getActiveNetworks();

    Object.entries(this.networkService.networkMap).forEach(([networkName, network]) => {
      const networkKey = networkName.toLowerCase();

      network.active = activeNetworks.some(({ name }) => isSameString(name, networkKey));

      if (!network.active) this.networkService.destroyApi(network.name);
    });

    if (this.ready) this.networkService.initNetworkApis();

    this.networkService.updateNetworkStore();
    this.networkService.saveSelectedNetworks();

    this.updateServiceInfo();
  }

  getActiveNetworksCurrentWallet(address: string) {
    const uniqNetworks = new Set<NetworkJson>();
    const networks = this.networkService.networkValues;
    const selectedNetwork = this.networkService.selectedNetworks[address];

    if (selectedNetwork === ALL_NETWORKS) return networks;

    if (selectedNetwork === POPULAR_NETWORKS) {
      const popular = networks.filter((el) => el.rank !== undefined);
      popular.forEach((el) => uniqNetworks.add(el));

      return uniqNetworks;
    }

    if (selectedNetwork === FAVORITE_NETWORKS) {
      const favorite = networks.filter((el) => el.favorite.length && el.favorite.includes(address));

      favorite.forEach((el) => uniqNetworks.add(el));

      return uniqNetworks;
    }

    const singleNetwork = networks.find((network) => network.name === selectedNetwork);

    if (singleNetwork) uniqNetworks.add(singleNetwork);

    return uniqNetworks;
  }

  getAllAddresses(): string[] {
    return Object.keys(accounts.subject.value);
  }

  // List all providers the extension is exposing
  rpcListProviders(): ResponseRpcListProviders {
    return Object.keys(this.providers).reduce((acc, key) => {
      acc[key] = this.providers[key].meta;

      return acc;
    }, {} as ResponseRpcListProviders);
  }

  rpcSend(request: RequestRpcSend, port: Port): Promise<JsonRpcResponse<unknown>> {
    const provider = this.injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribe) before provider is set');

    return provider.send(request.method, request.params);
  }

  // Start a provider, return its meta
  rpcStartProvider(key: string, port: Port): ProviderMeta {
    assert(Object.keys(this.providers).includes(key), `Provider ${key} is not exposed by extension`);

    if (this.injectedProviders.get(port)) {
      return this.providers[key].meta;
    }

    // Instantiate the provider
    this.injectedProviders.set(port, this.providers[key].start());
    storage.set({ injectedProviders: this.injectedProviders });

    // Close provider connection when page is closed
    port.onDisconnect.addListener((): void => {
      const provider = this.injectedProviders.get(port);

      if (provider) {
        withErrorLog(() => provider.disconnect());
      }

      this.injectedProviders.delete(port);

      storage.set({ injectedProviders: this.injectedProviders });
    });

    return this.providers[key].meta;
  }

  rpcSubscribe(
    { method, params, type }: RequestRpcSubscribe,
    cb: ProviderInterfaceCallback,
    port: Port
  ): Promise<number | string> {
    const provider = this.injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribe) before provider is set');

    return provider.subscribe(type, method, params, cb);
  }

  rpcSubscribeConnected(_request: null, cb: ProviderInterfaceCallback, port: Port): void {
    const provider = this.injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribeConnected) before provider is set');

    cb(null, provider.isConnected); // Immediately send back current isConnected

    provider.on('connected', () => cb(null, true));
    provider.on('disconnected', () => cb(null, false));
  }

  rpcUnsubscribe(request: RequestRpcUnsubscribe, port: Port): Promise<boolean> {
    const provider = this.injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.unsubscribe) before provider is set');

    return provider.unsubscribe(request.type, request.method, request.subscriptionId);
  }

  saveMetadata(meta: MetadataDef): void {
    this.requestService.saveMetadata(meta);

    addMetadata(meta);
  }

  getAccountAddress(): string {
    return this.currentAccount?.address ?? '';
  }

  fetchXcmInfo() {
    axios
      .get<XcmLocations>(URLS.XCM_LOCATIONS)
      .then(({ data }) => (this.xcmLocations = data))
      .catch(() => (this.xcmLocations = []));

    axios
      .get<XcmFees>(URLS.XCM_FEES)
      .then(({ data }) => (this.xcmFees = data))
      .catch(() => (this.xcmFees = []));
  }

  async init() {
    await this.eventService.waitCryptoReady;
    await Promise.all([
      this.networkService.initNetworkMap(),
      this.actionCapabilityService.init(),
      this.soraDisclaimerService.init(),
    ]);

    const accounts = this.keyringService.getAllMainAccounts();

    accounts.forEach(({ address, meta }) => {
      const { walletEcosystem } = meta as FWKeyringMeta;

      return this.balanceService.generateDefaultBalance(address, walletEcosystem!);
    });

    await this.balanceService.hydrateBalanceStorage(accounts.map(({ address }) => address));

    this.ready = true; // Set true if chain json is parsed and data is preped for init apis
    this.fetchXcmInfo();
    this.scamService.refreshScamAddressList();

    this.networkService.initNetworkApis();
    this.onReady();
    this.updateServiceInfo();
    void this.assetDiscoverySweepService.runIfDue();
  }

  private async scanDiscoveryNetwork(registryNetwork: NetworkJson): Promise<void> {
    const network = this.networkService.networkMap[registryNetwork.name];
    if (!network) return;

    const ecosystem = network.ecosystem;
    const accounts = this.keyringService.getAllMainAccounts();

    for (const account of accounts) {
      const meta = account.meta as FWKeyringMeta;
      const publicAccounts = meta.universalWallet?.publicAccounts ?? [];
      const publicAddress = (walletEcosystem: WalletEcosystem) =>
        publicAccounts.find(
          (item) =>
            item.ecosystem === walletEcosystem &&
            (!item.chainId || isSameString(item.chainId, network.chainId) || item.chainId.includes(network.chainId))
        )?.address;
      const supports = (walletEcosystem: WalletEcosystem) =>
        meta.walletEcosystem === walletEcosystem || publicAccounts.some((item) => item.ecosystem === walletEcosystem);
      const evmAddress = resolveAssetDiscoveryEvmAddress({
        primaryAddress: account.address,
        primaryEcosystem: meta.walletEcosystem,
        ethereumAddress: meta.ethereumAddress,
        publicAccounts,
      });
      const supportsSubstrate = supports(WalletEcosystem.Substrate);

      if (ecosystem === 'solana' && supports(WalletEcosystem.Solana)) {
        await this.balanceService.solanaBalanceService.fetchBalance({
          address: account.address,
          solanaAddress: meta.solanaAddress ?? publicAddress(WalletEcosystem.Solana),
          networks: [network.name],
        });
      } else if (ecosystem === 'bitcoin' && supports(WalletEcosystem.Bitcoin)) {
        await this.balanceService.bitcoinBalanceService.fetchBalance({
          address: account.address,
          bitcoinAddress: meta.bitcoinAddress,
          bitcoinTestnetAddress: meta.bitcoinTestnetAddress,
          networks: [network.name],
        });
      } else if (ecosystem === 'iroha' && supports(WalletEcosystem.Iroha)) {
        await this.balanceService.irohaBalanceService.fetchBalance({
          address: account.address,
          irohaAddress: meta.irohaAddress ?? publicAddress(WalletEcosystem.Iroha),
          networks: [network.name],
        });
      } else if (ecosystem === 'ton' && supports(WalletEcosystem.Ton)) {
        if (!this.getTonApiMap[network.name]) await this.networkService.tonApiHandler.initApi(network);
        await this.balanceService.tonBalanceService.fetchBalance(account.address, [network.name]);
      } else if (ecosystem === 'ethereum' && evmAddress) {
        const wasActive = network.active;
        if (!this.getEvmApi(network.name)) this.networkService.evmApiHandler.initEvmApi(network);
        await this.balanceService.evmBalanceService.fetchBalance({
          ethereumAddress: evmAddress,
          networks: [network.name.toLowerCase()],
          force: true,
        });
        if (!wasActive) this.networkService.evmApiHandler.destroyApi(network.name);
      } else if (
        canScanSubstrateBackedDiscoveryNetwork(ecosystem, supportsSubstrate, evmAddress)
      ) {
        const networkKey = network.name.toLowerCase();
        const wasActive = network.active;
        if (!this.getSubstrateApiMap[networkKey]?.api) await this.networkService.substrateApiHandler.initApi(network);
        const api = this.getSubstrateApiMap[networkKey]?.api;
        if (api) await Promise.race([api.isReady, new Promise((_, reject) => setTimeout(() => reject(new Error('discovery_api_timeout')), 15_000))]);
        await this.balanceService.substrateBalanceService.fetchBalance({
          address: publicAddress(WalletEcosystem.Substrate) ?? (supportsSubstrate ? account.address : evmAddress),
          ethereumAddress: evmAddress,
          networks: [network.name],
        });
        if (!wasActive) await this.networkService.substrateApiHandler.destroyApi(network.name);
      }
    }
  }

  updateNetworkForNewWallet(address: string) {
    this.setActiveNetworks(this.networkService.selectedNetworks[address] ?? ALL_NETWORKS);
  }

  updateCurrentAccount(
    { address, walletEcosystem = WalletEcosystem.Substrate }: RequestUpdateCurrentAccount,
    isNew = true
  ): boolean {
    if (isEthereumAddress(address)) return false;

    this.balanceService.generateDefaultBalance(address, walletEcosystem);

    this.saveCurrentAccountAddress(address, walletEcosystem, () => {
      this.keyringService.triggerWalletsSubscription(address, walletEcosystem);

      const activeValue =
        walletEcosystem === WalletEcosystem.Ton
          ? 'Ton Mainnet'
          : this.networkService.selectedNetworks[address] ?? POPULAR_NETWORKS;

      if (isNew) this.setActiveNetworks(activeValue);

      this.nftService.publishNfts();
      if (isNew && this.ready) void this.assetDiscoverySweepService.runIfDue({ force: true });
    });

    return true;
  }

  setCurrentAccount(data: CurrentAccountState, callback: () => void = () => null): void {
    this.keyringService.setCurrentAccount(data);

    // logic for Sora library
    this.poolsService.unsubscribePools();

    const isTonWallet = data?.walletEcosystem === WalletEcosystem.Ton;

    // logic for Sora library
    if (!isTonWallet && data?.address && !data.isMobile && data.walletEcosystem === 'substrate') {
      const pair = this.keyringService.getPair(data?.address)!;

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      apiSora.account = { json: null, pair };

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      apiSora.bridgeProxy.sub.account = { json: null, pair };
    }

    this.updateServiceInfo();
    callback();
  }

  saveCurrentAccountAddress(
    address: string,
    walletEcosystem: WalletEcosystem,
    callback?: (account: CurrentAccountState) => void
  ) {
    if (address === '') return this.setCurrentAccount(null);

    const {
      meta: {
        isMobile,
        name,
        ethereumAddress,
        bitcoinAddress,
        bitcoinTestnetAddress,
        solanaAddress,
        irohaAddress,
        irohaPublicKeyHex,
      },
    } = this.keyringService.getAccount(address, walletEcosystem) ?? this.keyringService.getAddress(address)!;

    const accountInfo: CurrentAccountInfo = {
      address,
      isMobile: !!(isMobile as boolean),
      name: name as string,
      ethereumAddress: (ethereumAddress as string) ?? '',
      bitcoinAddress: bitcoinAddress as string | undefined,
      bitcoinTestnetAddress: bitcoinTestnetAddress as string | undefined,
      solanaAddress: solanaAddress as string | undefined,
      irohaAddress: irohaAddress as string | undefined,
      irohaPublicKeyHex: irohaPublicKeyHex as string | undefined,
      walletEcosystem,
    };

    this.setCurrentAccount(accountInfo, () => callback?.(accountInfo));
  }

  cleanupDeletedAccount(address: string) {
    if (this.networkService.selectedNetworks[address]) {
      delete this.networkService.selectedNetworks[address];

      storage.set({ selectedNetworks: this.networkService.selectedNetworks });
    }

    this.nftService.deleteSavedNfts(address);
    this.balanceService.deleteBalance(address);
  }

  getAddressList(value = false): Record<string, boolean> {
    const addressList = Object.keys(accounts.subject.value);

    return addressList.reduce((addressList, v) => ({ ...addressList, [v]: value }), {});
  }

  private onReady() {
    this.subscriptionService.start();
    this.cronService.start();

    this.ready = true;
  }

  getCurrentAddress(network: NetworkName, _currentAccount?: CurrentAccountState): string {
    const currentAccount = _currentAccount ?? this.currentAccount;
    const networkProfile = this.networkService.networkValues.find(({ name }) => isSameString(name, network));
    const irohaNetwork = this.getIrohaExpectedNetwork(networkProfile);
    const ecosystem = networkProfile?.ecosystem;

    if (irohaNetwork) return this.formatIrohaAddress(currentAccount!, irohaNetwork);
    if (ecosystem === WalletEcosystem.Solana) return currentAccount!.solanaAddress ?? currentAccount!.address;
    if (ecosystem === WalletEcosystem.Bitcoin) return this.formatBitcoinAddress(currentAccount!, network);
    return isEthereumNetwork(network) ? currentAccount!.ethereumAddress : currentAccount!.address;
  }

  private getNetworkEcosystem(networkName: string) {
    return this.networkService.networkValues.find(({ name }) => isSameString(name, networkName))?.ecosystem;
  }

  private getBitcoinExpectedNetwork(networkName: string): BitcoinNetworkKind {
    const network = this.networkService.networkValues.find(({ name }) => isSameString(name, networkName));
    const contract = `${network?.chainId ?? ''} ${network?.name ?? ''} ${networkName}`.toLowerCase();

    return contract.includes('testnet') ? 'testnet' : 'mainnet';
  }

  private getIrohaExpectedNetwork(network: NetworkJson | undefined): IrohaNetworkInput | null {
    if (!network) return null;

    try {
      return resolveCanonicalIrohaAddressNetwork(network.chainId);
    } catch (error) {
      if (network.ecosystem === WalletEcosystem.Iroha) throw error;

      return null;
    }
  }

  private formatIrohaAddress({ address, irohaAddress, irohaPublicKeyHex }: Wallet, network: IrohaNetworkInput): string {
    if (irohaPublicKeyHex) {
      try {
        return encodeIrohaI105Address(irohaPublicKeyHex, network);
      } catch {
        return irohaAddress ?? address;
      }
    }

    return irohaAddress ?? address;
  }

  private formatBitcoinAddress({ address, bitcoinAddress, bitcoinTestnetAddress }: Wallet, networkName: string): string {
    if (this.getBitcoinExpectedNetwork(networkName) === 'testnet') return bitcoinTestnetAddress ?? address;

    return bitcoinAddress ?? address;
  }

  formatAddress(
    {
      address,
      ethereumAddress,
      bitcoinAddress,
      bitcoinTestnetAddress,
      solanaAddress,
      irohaAddress,
      irohaPublicKeyHex,
    }: Wallet,
    networkName: string = 'westend'
  ): string {
    const network = this.networkService.networksGithub.find(({ name }) => isSameString(name, networkName)) ??
      this.networkService.networkValues.find(({ name }) => isSameString(name, networkName));
    const irohaNetwork = this.getIrohaExpectedNetwork(network);
    const ecosystem = network?.ecosystem ?? this.getNetworkEcosystem(networkName);

    if (irohaNetwork)
      return this.formatIrohaAddress({ address, ethereumAddress, irohaAddress, irohaPublicKeyHex }, irohaNetwork);
    if (ecosystem === WalletEcosystem.Solana) return solanaAddress ?? address;
    if (ecosystem === WalletEcosystem.Bitcoin)
      return this.formatBitcoinAddress({ address, ethereumAddress, bitcoinAddress, bitcoinTestnetAddress }, networkName);

    const isEthereumNet = isEthereumNetwork(networkName);

    if (isEthereumNet) return ethereumAddress;

    // the only case for try/catch
    // if the user used ethereum account instead of a substratum account(via json or private key)
    try {
      return this.keyringService.encodeAddress(address, network?.addressPrefix);
    } catch {
      return ethereumAddress;
    }
  }

  isSameAddress(wallet1: Wallet, wallet2: Wallet): boolean {
    return this.formatAddress(wallet1) === this.formatAddress(wallet2);
  }

  async switchEvmNetworkByUrl(shortenUrl: string, networkKey: string): Promise<void> {
    const authUrls = await this.requestService.getAuthList();
    const network = this.networkService.getNetworkJson(networkKey);

    if (authUrls[shortenUrl]) {
      if (!network.active) await this.setActiveNetworks(networkKey);

      authUrls[shortenUrl].currentEvmNetworkKey = networkKey;

      this.requestService.setAuthorize(authUrls);
    } else {
      throw new Error(`Not found ${shortenUrl} in auth list`);
    }
  }
}
