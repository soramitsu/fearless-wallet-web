import axios from 'axios';
import { BehaviorSubject, Subject } from 'rxjs';

import { addMetadata } from '@polkadot/extension-chains';
import { assert } from '@polkadot/util';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { accounts } from '@subwallet/ui-keyring/observable/accounts';

import { EXTENSION_HOSTNAME, EXTENSION_ID } from '@extension-base/const';
import {
  CronService,
  EventService,
  GoogleService,
  KeyringService,
  NetworkService,
  NftService,
  OnboardingService,
  PoolsService,
  PricesService,
  RequestService,
  ScamService,
  StakingService,
  SubscriptionService,
  TimeoutService,
  WalletConnectDAppService,
  WalletConnectService,
} from '@extension-base/services';
import { KeyringLockService } from '@extension-base/services/keyring-service/KeyringLock';
import { getSoraUtil, getSoraUtilOrThrow } from '@extension-base/services/utils/sora';
import { storage } from '@extension-base/stores/Storage';
import EvmContractService from '../../services/evm-contract-service';
import { HistoryService } from '../../services/history-service';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';
import type { KeyringPair, KeyringPair$Json, KeyringPair$Meta } from '@polkadot/keyring/types';
import type { JsonRpcResponse, ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { CreateResult } from '@polkadot/ui-keyring/types';

import type {
  ActiveTabAuthorizeStatus,
  AuthUrlInfo,
  AuthUrls,
  IState,
  Port,
  Providers,
  RequestRpcSend,
  RequestRpcSubscribe,
  RequestRpcUnsubscribe,
  RequestUpdateCurrentAccount,
  ResponseRpcListProviders,
  ServiceInfo,
} from '@extension-base/background/types/types';
import type { CurrentAccountInfo, CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import type { FWKeyringMeta } from '@extension-base/types';
import { ALL_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { URLS } from '@/consts/urls';
import BalanceService from '@/extension/background/extension-base/src/services/balance-service';
import { stripUrl, withErrorLog } from '@/extension/background/extension-base/src/background/helpers';
import { isEthereumNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import { WalletEcosystem, type NetworkName, type SoraFees, type XcmFees, type XcmLocations } from '@/interfaces';
import { isSameString } from '@/helpers';
import { filterNetworksBySelection } from '@/helpers/networkGroups';

type Wallet = {
  address: string;
  ethereumAddress: string;
};

const buildInitialSoraFees = (): SoraFees => {
  try {
    const { api, FPNumber } = getSoraUtilOrThrow();

    return Object.fromEntries(
      Object.entries(api.NetworkFee ?? {}).map(([operation, value]) => [
        operation,
        FPNumber.fromCodecValue(value).toString(),
      ])
    ) as SoraFees;
  } catch {
    return {} as SoraFees;
  }
};

const createAccountResult = (pair: KeyringPair): CreateResult => {
  const meta: KeyringPair$Meta = { ...pair.meta };

  const json: KeyringPair$Json = {
    address: pair.address,
    encoded: '',
    encoding: {
      content: ['pkcs8', pair.type],
      type: 'none',
      version: '0',
    },
    meta,
  };

  return { json, pair };
};

export default class State {
  private ready = false;
  injectedProviders: Map<Port, ProviderInterface> = new Map();
  providers: Providers = {};
  serviceInfoSubject = new Subject<ServiceInfo>();
  xcmFees: XcmFees = [];
  xcmLocations: XcmLocations = [];
  soraFees: BehaviorSubject<SoraFees> = new BehaviorSubject<SoraFees>(buildInitialSoraFees());
  currentTabStatus: ActiveTabAuthorizeStatus = {
    isAuthorize: false,
    authorizeAccountsCount: 0,
    dAppName: '',
  };

  onboardingService = new OnboardingService();
  eventService = new EventService();
  evmContractService = new EvmContractService();
  keyringService = new KeyringService(this.eventService);
  networkService = new NetworkService(this.keyringService, this);
  requestService = new RequestService(this.keyringService, this);
  walletConnectService = new WalletConnectService(this, this.requestService);
  walletConnectDappService = new WalletConnectDAppService(this);
  balanceService = new BalanceService(this);
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

    const cb = () => (authUrls: AuthUrls) => {
      const authorizeUrls = Object.keys(authUrls).filter((url) => url === tabHostName);
      const isAuthorize = authorizeUrls.length !== 0;

      this.currentTabStatus = {
        isAuthorize,
        authorizeAccountsCount: isAuthorize ? authUrls[tabHostName].authorizedAccounts.length : 0,
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
          meta: { name, ethereumAddress, isMobile, walletEcosystem },
        },
      ] = allAccounts;

      this.setCurrentAccount({
        address,
        name: name!,
        ethereumAddress: ethereumAddress!,
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
    const networks = this.networkService.networkValues;
    const selectedNetwork = this.networkService.selectedNetworks[address];

    if (!selectedNetwork || selectedNetwork === ALL_NETWORKS) return new Set(networks);

    const relevantNetworks = filterNetworksBySelection(networks, selectedNetwork, {
      favoriteAddress: address,
    });

    return new Set(relevantNetworks);
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

  async rpcConnect(port: Port): Promise<boolean> {
    const provider = this.injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.connect) before provider is set');

    if (typeof provider.connect !== 'function') {
      console.warn('Selected provider does not support connect, skipping manual connect request.');

      return true;
    }

    await provider.connect();

    return true;
  }

  async rpcDisconnect(port: Port): Promise<boolean> {
    const provider = this.injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.disconnect) before provider is set');

    if (typeof provider.disconnect !== 'function') {
      console.warn('Selected provider does not support disconnect, skipping manual disconnect request.');

      return true;
    }

    await provider.disconnect();

    return true;
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

  rpcSubscribeConnected(_request: null, cb: ProviderInterfaceCallback, port: Port): () => void {
    const provider = this.injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribeConnected) before provider is set');

    const unsubscribeConnected = provider.on('connected', () => cb(null, true));
    const unsubscribeDisconnected = provider.on('disconnected', () => cb(null, false));

    cb(null, provider.isConnected); // Immediately send back current isConnected

    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
    };
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
    await this.networkService.initNetworkMap();

    this.keyringService.getAllMainAccounts().forEach(({ address, meta }) => {
      const { walletEcosystem } = meta as FWKeyringMeta;

      return this.balanceService.generateDefaultBalance(address, walletEcosystem!);
    });

    this.ready = true; // Set true if chain json is parsed and data is preped for init apis
    this.fetchXcmInfo();
    this.scamService.refreshScamAddressList();

    this.networkService.initNetworkApis();
    this.onReady();
    this.updateServiceInfo();
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
          : (this.networkService.selectedNetworks[address] ?? POPULAR_NETWORKS);

      if (isNew) this.setActiveNetworks(activeValue);

      this.nftService.publishNfts();
    });

    return true;
  }

  setCurrentAccount(data: CurrentAccountState, callback: () => void = () => null): void {
    this.keyringService.setCurrentAccount(data);

    // logic for Sora library
    this.poolsService.unsubscribePools();

    this.syncSoraAccount(data);

    this.updateServiceInfo();
    callback();
  }

  private syncSoraAccount(data: CurrentAccountState): void {
    const shouldAttach =
      data !== null && !data.isMobile && data.walletEcosystem === WalletEcosystem.Substrate && !!data.address;

    if (!shouldAttach) return;

    const pair = this.keyringService.getPair(data.address!);

    if (!pair) return;

    const assignPair = (api: Awaited<ReturnType<typeof getSoraUtil>>['api']) => {
      const accountResult = createAccountResult(pair as unknown as KeyringPair);

      api.account = accountResult;

      if (api.bridgeProxy?.sub) {
        api.bridgeProxy.sub.account = accountResult;
      }
    };

    try {
      const cached = getSoraUtilOrThrow();

      assignPair(cached.api);

      return;
    } catch {
      // fallthrough to async load
    }

    void getSoraUtil()
      .then(({ api }) => {
        if (this.currentAccount?.address !== data.address) return;

        assignPair(api);
      })
      .catch(() => null);
  }

  saveCurrentAccountAddress(
    address: string,
    walletEcosystem: WalletEcosystem,
    callback?: (account: CurrentAccountState) => void
  ) {
    if (address === '') return this.setCurrentAccount(null);

    const {
      meta: { isMobile, name, ethereumAddress },
    } = this.keyringService.getAccount(address, walletEcosystem) ?? this.keyringService.getAddress(address)!;

    const accountInfo: CurrentAccountInfo = {
      address,
      isMobile: !!(isMobile as boolean),
      name: name as string,
      ethereumAddress: (ethereumAddress as string) ?? '',
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

    return isEthereumNetwork(network) ? currentAccount!.ethereumAddress : currentAccount!.address;
  }

  formatAddress({ address, ethereumAddress }: Wallet, networkName: string = 'westend'): string {
    const isEthereumNet = isEthereumNetwork(networkName);

    if (isEthereumNet) return ethereumAddress;

    const network = this.networkService.networksGithub.find(({ name }) => isSameString(name, networkName))!;

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
