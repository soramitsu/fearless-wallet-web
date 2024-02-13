import { Subject } from 'rxjs';
import { addMetadata, knownMetadata } from '@polkadot/extension-chains';
import { isEthereumAddress, base64Decode } from '@polkadot/util-crypto';
import { assert, u8aToHex } from '@polkadot/util';
import { accounts } from '@polkadot/ui-keyring/observable/accounts';
import { decodePair } from '@polkadot/keyring/pair/decode';
import {
  EventService,
  SoraCardService,
  OnboardingService,
  KeyringService,
  StakingService,
  NetworkService,
  RequestService,
  WalletConnectService,
  NftService,
  GoogleService,
  WalletConnectDAppService,
} from '@extension-base/services';
import { api as apiSora, type FPNumber } from '@sora-substrate/util';
import { storage } from '@extension-base/stores/Storage';
import { FWCron } from '@extension-base/background/cron';
import { isEthereumNetwork, isRequireEvmAPI } from '@extension-base/background/utils/utils';
import { withErrorLog } from '@extension-base/background/handlers/helpers';
import { FWSubscription, isSubscriptionRunning, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import PricesService from '@extension-base/services/prices-service';
import { fetchEvmAssetBalance } from '@extension-base/api/evm/balance';
import { REFRESH_TIME } from '@extension-base/api/evm/utils/eth';
import BalanceService from '@extension-base/services/balance-service';
import axios from 'axios';
import { EXTENSION_HOSTNAME, EXTENSION_ID } from '@extension-base/const';
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
  RequestAccountExportPrivateKey,
  ResponseAccountExportPrivateKey,
  FetchEvmBalancePayload,
} from '@extension-base/background/types/types';
import type { ChainRegistry, NetworkJson } from '@extension-base/types';
import type { JsonRpcResponse, ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';
import type { SoraFees, XcmLocations, XcmFees, NetworkName } from '@/interfaces';
import { URLS } from '@/consts/urls';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';

export const cacheRegistryMap: Record<string, ChainRegistry> = {};
type Wallet = {
  address: string;
  ethereumAddress: string;
};
export type Passwords = {
  [address in string]: string | undefined;
};

export default class State {
  public cron: FWCron;
  public passwords: Passwords = {};
  public subscription: FWSubscription;
  public injectedProviders: Map<Port, ProviderInterface> = new Map();
  public providers: Providers = {};
  public readonly unsubscriptionMap: Record<string, () => void> = {};
  public serviceInfoSubject = new Subject<ServiceInfo>();
  public xcmFees: XcmFees = [];
  public xcmLocations: XcmLocations = [];
  public lazyMap: Record<string, unknown> = {};
  public soraFees: SoraFees = {} as SoraFees;
  public ready = false;
  public currentTabStatus: ActiveTabAuthorizeStatus = {
    isAuthorize: false,
    authorizeAccountsCount: 0,
    dAppName: '',
  };

  public onboardingService = new OnboardingService();
  public eventService = new EventService();
  public keyringService = new KeyringService(this.eventService);
  public networkService = new NetworkService(this, this.keyringService);
  public requestService = new RequestService(this.keyringService);
  public walletConnectService = new WalletConnectService(this, this.requestService);
  public walletConnectDappService = new WalletConnectDAppService(this);
  public balanceService = new BalanceService(this);
  public pricesService = new PricesService(this.networkService);
  public nftService = new NftService(this);
  public soraCardService = new SoraCardService(this.requestService);
  public stakingService = new StakingService(this);
  public googleService = new GoogleService();

  constructor() {
    this.injectFromStorage();
    this.onboardingService.init();
    this.cron = new FWCron(this);
    this.subscription = new FWSubscription(this, this.cron);
    this.init();
  }

  public get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }

  public get networkValues() {
    return this.networkService.networkValues;
  }

  public get assetsMap() {
    return this.networkValues.map(({ assets }) => assets).flat();
  }

  public getEvmApi(key: string) {
    return this.getEvmApiMap[key.toLowerCase()];
  }

  get authSubject() {
    return this.requestService.authSubject;
  }

  public get getSubstrateApiMap() {
    return this.networkService.substrateApiHandler.api;
  }

  public get getEvmApiMap() {
    return this.networkService.evmApiHandler.api;
  }

  public createUnsubscriptionHandle(id: string, unsubscribe: () => void): void {
    this.unsubscriptionMap[id] = unsubscribe;
  }

  public cancelSubscription(id: string): boolean {
    if (isSubscriptionRunning(id)) {
      unsubscribe(id);
    }

    if (this.unsubscriptionMap[id]) {
      this.unsubscriptionMap[id]();

      delete this.unsubscriptionMap[id];
    }

    return true;
  }

  public subscribeServiceInfo() {
    return this.serviceInfoSubject;
  }

  public getFromStorage(key: (keyof IState)[]) {
    return storage.get(key);
  }

  public isReady() {
    return this.ready;
  }

  async injectFromStorage() {
    const { injectedProviders, providers } = await this.getFromStorage(['injectedProviders', 'providers']);

    if (injectedProviders) this.injectedProviders = new Map(injectedProviders);
    if (providers) this.providers = providers;
  }

  async approvePolkaswap(authorizedAccounts: string[]): Promise<void> {
    this.soraCardService.approvePolkaswap(authorizedAccounts);
  }

  public updateCurrentTabsUrl([tab]: chrome.tabs.Tab[]) {
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

    this.requestService.getAuthorize((authUrls) => {
      const authorizeUrl = Object.keys(authUrls).filter((url) => url === tabHostName);
      const isAuthorize = authorizeUrl.length !== 0;

      this.currentTabStatus = {
        isAuthorize,
        authorizeAccountsCount: isAuthorize ? authUrls[tabHostName].authorizedAccounts.length : 0,
        dAppName: tabHostName,
      };
    });
  }

  public async onInstall() {
    const currentAccount = this.currentAccount;

    if (currentAccount) {
      this.setCurrentAccount(currentAccount);

      return;
    }

    const accounts = this.keyringService.getSubstrateAccounts();

    if (accounts.length === 0) this.setCurrentAccount(null);
    else {
      const [
        {
          address,
          meta: { name, ethereumAddress, isMobile },
        },
      ] = accounts;

      this.setCurrentAccount({
        address,
        name: name as string,
        ethereumAddress: ethereumAddress as string,
        isMobile: isMobile as boolean,
      });
    }
  }

  get networkMap() {
    return this.networkService.networkMap;
  }

  public upsertNetworkMap(data: NetworkJson): boolean {
    return this.networkService.upsertNetworkMap(data, () => {
      this.updateServiceInfo();
    });
  }

  public disableNetworkMap(networkKey: string): boolean {
    //if it's already disconnected then return true
    this.networkService.disableNetworkMap(networkKey, () => {
      this.updateServiceInfo();

      this.requestService.getAuthorize((data) => {
        this.requestService.setAuthorize(data);
      });
    });

    return true;
  }

  public updateServiceInfo() {
    this.serviceInfoSubject.next({
      networkMap: this.networkMap,
      apiMap: this.networkService.getApiMap,
      currentAccountInfo: this.currentAccount,
    });
  }

  async setFavoriteNetwork(networkName: string): Promise<boolean> {
    const network = this.networkMap[networkName];
    const currentAccount = this.currentAccount;

    if (!currentAccount) return false;

    const addressIndex = network.favorite.findIndex((address) => address === currentAccount.address);

    addressIndex !== -1 ? network.favorite.splice(addressIndex, 1) : network.favorite.push(currentAccount.address);

    return true;
  }

  public async setActiveNetworks(type: string) {
    const currentAccount = this.currentAccount;

    if (!currentAccount) return;

    this.networkService.selectedNetworks[currentAccount.address] = type;

    const unsub = this.subscription.getSubscription('balance');
    unsub?.();

    const networks = this.networkService.getActiveNetworks();

    Object.keys(this.networkMap).forEach((key) => {
      const networkKey = key.toLowerCase();
      const network = this.networkMap[key];

      network.active = networks.some(({ name }) => name.toLowerCase() === networkKey);

      const isActive = network.active;

      if (!isActive && network.isEthereum && this.getEvmApiMap[networkKey]) {
        this.getEvmApiMap[networkKey].api.destroy();
        delete this.getEvmApiMap[networkKey];
      } else if (!isActive && this.getSubstrateApiMap[networkKey]) {
        this.getSubstrateApiMap[networkKey].provider?.disconnect().then(() => {
          delete this.getSubstrateApiMap[networkKey];
        });
      }
    });

    if (this.ready) this.networkService.initNetworkApis();

    this.updateServiceInfo();

    this.networkService.updateNetworks();
    this.fetchEvmBalance({});
    this.networkService.saveSelectedNetworks();
  }

  getActiveNetworksCurrentWallet(address: string) {
    const uniqNetworks = new Set<NetworkJson>();
    const networks = this.networkValues;
    const selectedNetwork = this.networkService.selectedNetworks[address];

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

  getCurrentTabStatus() {
    return this.currentTabStatus;
  }

  public getAllAddresses(): string[] {
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

  public getAccountAddress(): string {
    return this.currentAccount?.address ?? '';
  }

  get currentAccount() {
    return this.keyringService.currentAccount;
  }

  fetchXcmInfo() {
    axios
      .get<XcmLocations>(URLS.XCM_LOCATIONS)
      .then(({ data }) => {
        this.xcmLocations = data;
      })
      .catch(() => {
        this.xcmLocations = [];
      });

    axios
      .get<XcmFees>(URLS.XCM_FEES)
      .then(({ data }) => {
        this.xcmFees = data;
      })
      .catch(() => {
        this.xcmFees = [];
      });
  }

  public async init() {
    await this.eventService.waitCryptoReady;
    await this.networkService.initNetworkMap();
    this.keyringService
      .getSubstrateAccounts()
      .forEach(({ address }) => this.balanceService.generateDefaultBalance(address));
    this.ready = true; //Set true if chain json is parsed and data is preped for init apis
    this.fetchXcmInfo();

    await this.networkService.initNetworkApis();
    this.onReady();
    this.updateServiceInfo();
  }

  public updateNetworkForNewWallet(address: string) {
    this.setActiveNetworks(this.networkService.selectedNetworks[address] ?? ALL_NETWORKS);
  }

  public updateCurrentAccount(address: string, isNew = true): boolean {
    if (isEthereumAddress(address)) return false;

    this.balanceService.generateDefaultBalance(address);

    this.saveCurrentAccountAddress(address, () => {
      this.keyringService.triggerWalletsSubscription();

      if (isNew) this.setActiveNetworks(this.networkService.selectedNetworks[address] ?? ALL_NETWORKS);
    });

    return true;
  }

  public setCurrentAccount(data: CurrentAccountState, callback: () => void = () => null, updateNetworks = true): void {
    this.keyringService.setCurrentAccount(data);

    if (updateNetworks) {
      // logic for Sora library
      if (data?.address && !data.isMobile) {
        const pair = this.keyringService.getPair(data?.address)!;

        apiSora.account = { json: null as any, pair };
        apiSora.bridgeProxy.sub.account = { json: null as any, pair };

        // TODO добавить фича тогл
        this.subscribeTotalXorBalance();
      }
    }

    this.updateServiceInfo();
    callback();
  }

  public saveCurrentAccountAddress(address: string, callback?: (account: CurrentAccountState) => void) {
    if (address === '') return this.setCurrentAccount(null);

    const {
      meta: { isMobile, name, ethereumAddress },
    } = this.keyringService.getAccount(address) ?? this.keyringService.getAddress(address)!;

    const accountInfo: CurrentAccountInfo = {
      address,
      isMobile: !!(isMobile as boolean),
      name: name as string,
      ethereumAddress: (ethereumAddress as string) ?? '',
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

  public subscribeTotalXorBalance() {
    if (!apiSora.api || !apiSora.api.isConnected) return;

    try {
      const subscription = apiSora.assets
        .getTotalXorBalanceObservable()
        .subscribe((xorTotalBalance: FPNumber) => this.balanceService.updateXorTotalBalance(xorTotalBalance));

      this.subscription.updateSubscription({ name: 'xorTotalBalance', func: subscription.unsubscribe });
    } catch (ex) {
      console.error('failed subscribe or unsubscribe to XOR balance');
    }
  }

  public accountExportPrivateKey({
    address,
    password,
  }: RequestAccountExportPrivateKey): ResponseAccountExportPrivateKey {
    const pass = this.passwords[address] ?? password;
    const json = this.keyringService.backupAccount(address, pass!);
    if (!json) throw new Error('Json was not exported');

    const decoded = decodePair(pass, base64Decode(json.encoded), json.encoding.type);

    const privateKey = u8aToHex(decoded.secretKey);
    const publicKey = u8aToHex(decoded.publicKey);

    if (password) this.passwords[address] = password;

    return {
      privateKey,
      publicKey,
    };
  }

  public lazyNext = (key: string, callback: () => void) => {
    if (this.lazyMap[key]) clearTimeout(this.lazyMap[key] as number);

    const lazy = setTimeout(() => {
      callback();
      clearTimeout(lazy);
    }, 300);

    this.lazyMap[key] = lazy;
  };

  public getAddressList(value = false): Record<string, boolean> {
    const addressList = Object.keys(accounts.subject.value);

    return addressList.reduce((addressList, v) => ({ ...addressList, [v]: value }), {});
  }

  private onReady() {
    this.subscription.start();
    this.cron.start();

    this.ready = true;
  }

  async getCurrentAddress(network: NetworkName, _currentAccount?: CurrentAccountState) {
    const currentAccount = _currentAccount ?? (await this.currentAccount);

    return isEthereumNetwork(network) ? currentAccount!.ethereumAddress : currentAccount!.address;
  }

  async fetchEvmBalance({ _networks, _ethereumAddress, assetId, force }: FetchEvmBalancePayload) {
    if (!this.ready) return;

    const currentAccount = this.currentAccount;

    const ethereumAddress = _ethereumAddress ?? currentAccount?.ethereumAddress ?? '';

    if (ethereumAddress === '') return;

    const substrateAddress = this.keyringService.getSubstrateAddress(ethereumAddress);

    const activeEvmNetworks = this.networkValues.filter(({ name, active }) => {
      if (_networks && !_networks.includes(name)) return false;

      if (!active || !isRequireEvmAPI(name)) return false;

      return true;
    });

    if (!activeEvmNetworks.length) return;

    activeEvmNetworks.forEach(({ assets, name }) => {
      const api = this.getEvmApi(name);
      const timeout = api.timeout[substrateAddress] ?? Number.MIN_VALUE;
      const timeDiff = Date.now() - timeout;
      const shouldSkipUpdate = timeDiff < REFRESH_TIME && !force;

      if (shouldSkipUpdate) return;

      assets.forEach(({ id }) => {
        if (assetId && assetId !== id) return;

        fetchEvmAssetBalance(ethereumAddress, name, id, this);
      });
    });
  }

  formatAddress({ address, ethereumAddress }: Wallet, networkName: string = 'westend'): string {
    const isEthereumNet = isEthereumNetwork(networkName);

    if (isEthereumNet) return ethereumAddress;

    const network = this.networkService.networkMap[networkName.toLowerCase()];

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
}
