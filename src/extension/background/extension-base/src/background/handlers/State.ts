import { BehaviorSubject, Subject } from 'rxjs';
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
} from '@extension-base/services';
import { api as apiSora, FPNumber } from '@sora-substrate/util';
import NetworkMapStore from '@extension-base/stores/NetworkMap';
import { storage } from '@extension-base/stores/Storage';
import CustomTokenStore from '@extension-base/stores/CustomEvmToken';
import { initWeb3Api } from '@extension-base/api/evm';
import PriceStore from '@extension-base/stores/Price';
import { getTokenPrice } from '@extension-base/utils/coingecko';
import { getCurrentProvider, getId } from '@extension-base/utils/utils';
import { initApi } from '@extension-base/api/substrate/api';
import { axios } from '@extension-base/utils/axios';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { FWCron } from '@extension-base/background/cron';
import { isEthereumNetwork, isRequireEvmAPI } from '@extension-base/background/utils/utils';
import { withErrorLog } from '@extension-base/background/handlers/helpers';
import { FWSubscription, isSubscriptionRunning, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import { KeyringAddress } from '@polkadot/ui-keyring/types';
import { SignerPayloadRaw } from '@polkadot/types/types';
import {
  PriceJson,
  ServiceInfo,
  MobileSignRequest,
  MobileSigningRequest,
  ResponseSigning,
} from '@extension-base/background/types/types';
import CurrentAccountStore, { CurrentAccountState } from '../../stores/CurrentAccountStore';
import { fetchEvmAssetBalance } from '../../api/evm/balance';
import { REFRESH_TIME } from '../../api/evm/utils/eth';
import WalletConnectDAppService from '../../services/wallet-connect-service/dapp';
import BalanceService from '../../services/balance-service';
import type {
  AuthUrls,
  Resolver,
  AuthorizedAccountsDiff,
  RequestRpcSend,
  RequestRpcSubscribe,
  RequestRpcUnsubscribe,
  ResponseRpcListProviders,
  Port,
  IState,
  ActiveTabAuthorizeStatus,
  Providers,
  RequestAuthorizeCancel,
  ApiProps,
  RequestAccountExportPrivateKey,
  ResponseAccountExportPrivateKey,
  EvmApiMap,
} from '@extension-base/background/types/types';
import type { CustomTokenJson } from '@extension-base/api/evm/types/ether';
import type { ChainRegistry, NetworkJson } from '@extension-base/types';
import type { JsonRpcResponse, ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';
import type { HexString } from '@polkadot/util/types';
import type { SoraFees, XcmLocations, XcmFees, NetworkName } from '@/interfaces';
import { URLS } from '@/consts/urls';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { EXTENSION_ID } from '@/consts/global';

export const cacheRegistryMap: Record<string, ChainRegistry> = {};

type APIs = {
  evm: EvmApiMap;
  substrate: Record<NetworkName, ApiProps>;
};

type Timespans = {
  evmBalances?: Record<string, number>;
};

type EvmTimeouts = {
  [address in string]: NodeJS.Timer | null;
};

export type Passwords = {
  [address in string]: string | undefined;
};

export type Prices = {
  json: PriceJson;
  timestamp: number;
};

export default class State {
  public cron: FWCron;
  public timespans: Timespans = {};
  public evmTimeouts: EvmTimeouts = {};
  public passwords: Passwords = {};
  public prices: Prices = {
    json: {
      tokenPriceMap: {},
      currency: 'usd',
      priceMap: {},
      tokenPriceChange: {},
    },
    timestamp: 0,
  };
  public subscription: FWSubscription;
  public injectedProviders: Map<Port, ProviderInterface> = new Map();
  public providers: Providers = {};
  public chainRegistryMap: Record<string, ChainRegistry> = {};
  public chainRegistrySubject = new Subject<Record<string, ChainRegistry>>();
  public readonly unsubscriptionMap: Record<string, () => void> = {};
  private readonly currentAccountStore = new CurrentAccountStore();
  private readonly priceStore = new PriceStore();
  private readonly evmChainSubject = new Subject<AuthUrls>();
  private readonly authorizeUrlSubject = new Subject<AuthUrls>();
  public signature: HexString | null = null;
  public defaultAuthAccountSelection: string[] = [];
  private lockNetworkMap = false;
  public apis: APIs = {
    substrate: {},
    evm: {},
  };
  private priceStoreReady = false;
  public fiatSymbol = 'usd';
  public xcmFees: XcmFees = [];
  public xcmLocations: XcmLocations = [];
  public networkMap: Record<string, NetworkJson> = {}; // mapping to networkMapStore, for uses in background
  public networksJson: NetworkJson[] = []; // from github
  readonly networkMapStore = new NetworkMapStore(); // persist custom networkMap by user
  public networkMapSubject = new Subject<Record<string, NetworkJson>>();
  public selectedNetworks: Record<string, string> = {};
  public serviceInfoSubject = new Subject<ServiceInfo>();
  public customTokenState: CustomTokenJson = { erc20: [] };
  public customTokenSubject = new Subject<CustomTokenJson>();
  public customTokenStore = new CustomTokenStore();
  public mobileSignRequests: Record<string, MobileSignRequest> = {};
  public readonly mobileSignSubject = new BehaviorSubject<MobileSigningRequest[]>([]); //TODO MOVE TO. IT's ON HANDLER
  public lazyMap: Record<string, unknown> = {};
  public soraFees: SoraFees = {} as SoraFees;
  public ready = false;
  public currentTabStatus: ActiveTabAuthorizeStatus = {
    isAuthorize: false,
    authorizeAccountsCount: 0,
    dAppName: '',
  };
  public keyringService = new KeyringService(this);
  public eventService = new EventService();
  public networkService = new NetworkService(this.eventService);
  public requestService = new RequestService(this, this.networkService);
  public walletConnectService = new WalletConnectService(this, this.requestService);
  public walletConnectDappService = new WalletConnectDAppService(this);

  public soraCardService = new SoraCardService(this.requestService);
  public onboardingService = new OnboardingService();
  public stakingService = new StakingService(this);
  public balanceService = new BalanceService(this);

  public get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }

  constructor() {
    this.injectFromStorage();
    this.onboardingService.init();
    this.cron = new FWCron(this);
    this.subscription = new FWSubscription(this, this.cron);
    this.init();
  }

  public setFiatSymbol(symbol: string) {
    this.fiatSymbol = symbol;

    chrome.storage.local.set({ fiatSymbol: this.fiatSymbol });
  }

  public get assetsMap() {
    return this.networksJson.map(({ assets }) => assets).flat();
  }

  public get getSubstrateApiMap() {
    return this.apis.substrate;
  }

  public get getEvmApiMap() {
    return this.apis.evm;
  }

  public get getApiMap() {
    return this.apis;
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

  public allMobileSignRequests(): MobileSigningRequest[] {
    return Object.values(this.mobileSignRequests).map(({ id, request }): MobileSigningRequest => ({ id, request }));
  }

  async injectFromStorage() {
    const { defaultAuthAccountSelection, fiatSymbol, injectedProviders, providers, selectedNetworks } =
      await this.getFromStorage([
        'fiatSymbol',
        'authUrls',
        'selectedNetworks',
        'defaultAuthAccountSelection',
        'injectedProviders',
        'providers',
        'windows',
      ]);

    if (fiatSymbol) this.setFiatSymbol(fiatSymbol);
    if (selectedNetworks) this.selectedNetworks = selectedNetworks;
    if (injectedProviders) this.injectedProviders = new Map(injectedProviders);
    if (providers) this.providers = providers;
    if (defaultAuthAccountSelection && defaultAuthAccountSelection.length)
      this.defaultAuthAccountSelection = defaultAuthAccountSelection;
  }

  approvePolkaswap = async (authorizedAccounts: string[]): Promise<void> => {
    this.soraCardService.approvePolkaswap(authorizedAccounts);

    this.updateDefaultAuthAccounts(authorizedAccounts);
  };

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
    const tabHostName =
      url.hostname === EXTENSION_ID || url.hostname === '39fb1478-3519-4b4e-8eba-15e6e594494c'
        ? 'header.currentExtensionPage'
        : url.hostname;

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
    const currentAccount = await this.currentAccount;

    if (currentAccount) {
      this.setCurrentAccount(currentAccount);

      return;
    }

    const accounts = this.getSubstrateAccounts();

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

  public upsertNetworkMap(data: NetworkJson): boolean {
    if (this.lockNetworkMap) return false;

    this.lockNetworkMap = true;

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
      if (name in this.apis.substrate) {
        this.apis.substrate[name].api?.disconnect && this.apis.substrate[name].api?.disconnect();

        delete this.apis.substrate[name];
      }

      if (isEthereum && name in this.apis.evm) delete this.apis.evm[name];

      if (currentProvider) {
        if (isEthereum && isRequireEvmAPI(name)) this.initWeb3Api(data);
        else initApi(data, this);
      }
    }

    this.networkMapSubject.next(this.networkMap);
    this.networkMapStore.set('NetworkMap', this.networkMap);

    this.updateServiceInfo();

    this.lockNetworkMap = false;

    return true;
  }

  public disableNetworkMap(networkKey: string): boolean {
    if (this.lockNetworkMap) return false;

    this.lockNetworkMap = true;

    if (this.networkMap[networkKey]?.isEthereum) delete this.apis.evm[networkKey];
    else delete this.apis.substrate[networkKey];

    this.networkMap[networkKey].active = false;
    this.networkMap[networkKey].networkStatus = NETWORK_STATUS.DISCONNECTED;

    this.networkMapSubject.next(this.networkMap);
    this.updateServiceInfo();
    this.networkMapStore.set('NetworkMap', this.networkMap);

    this.lockNetworkMap = false;

    this.requestService.getAuthorize((data) => {
      if (this.networkMap[networkKey].isEthereum) this.evmChainSubject.next(data);

      this.authorizeUrlSubject.next(data);
    });

    return true;
  }

  public updateServiceInfo() {
    this.getCurrentAccount((currentAccountInfo) => {
      this.serviceInfoSubject.next({
        networkMap: this.networkMap,
        apiMap: this.apis,
        currentAccountInfo,
      });
    });
  }

  public refreshWeb3Api(network: string) {
    this.initWeb3Api(this.networkMap[network]);
  }

  public initWeb3Api(network: NetworkJson | undefined) {
    if (network === undefined) return;

    this.getCurrentAccount((value) => {
      if (value?.ethereumAddress === '') return;

      const { name } = network;
      const currentProvider = getCurrentProvider(network);

      if (currentProvider) this.apis.evm[name.toLowerCase()] = initWeb3Api(currentProvider);
    });
  }

  public refreshDotSamaApi(key: string) {
    if (this.getSubstrateApiMap[key]) {
      this.getSubstrateApiMap[key].nodeIndex = 0;
      this.getSubstrateApiMap[key].apiRetry = 0;
    }

    const network = this.getNetworkByKey(key);

    initApi(network, this);
  }

  public getNetworkByKey(key: string): NetworkJson {
    return Object.values(this.networkMap).find((network) => network.name.toLowerCase() === key.toLowerCase())!;
  }

  public getNetworkGroupType() {
    return this.getNetworkGroupType;
  }

  async setFavoriteNetwork(networkName: string): Promise<boolean> {
    const network = this.networkMap[networkName];
    const currentAccount = await this.currentAccount;

    if (!currentAccount) return false;

    const addressIndex = network.favorite.findIndex((address) => address === currentAccount.address);

    addressIndex !== -1 ? network.favorite.splice(addressIndex, 1) : network.favorite.push(currentAccount.address);

    return true;
  }

  public getActiveNetworks(address: string) {
    const selectedNetwork = this.selectedNetworks[address];

    const networks = Object.values(this.networkMap);
    const activeNetworks =
      selectedNetwork === ALL_NETWORKS
        ? networks
        : networks.filter(({ rank, name, favorite }) => {
            if (selectedNetwork === POPULAR_NETWORKS) return rank !== undefined;

            if (selectedNetwork === FAVORITE_NETWORKS) return favorite?.includes(address);

            return name === selectedNetwork;
          });

    return activeNetworks;
  }

  public async setActiveNetworks(type?: string) {
    const currentAccount = await this.currentAccount;

    if (!currentAccount) return;

    if (type) this.selectedNetworks[currentAccount.address] = type;

    const networks = this.getActiveNetworks(currentAccount.address);

    Object.keys(this.networkMap).forEach(async (key) => {
      const isActive = networks.some(({ name }) => name.toLowerCase() === key.toLowerCase());

      this.networkMap[key].active = isActive;

      if (isActive) return;

      const isEthereum = this.networkMap[key].isEthereum;

      if (isEthereum && this.apis.evm[key]) {
        this.apis.evm[key].destroy();

        delete this.apis.evm[key];
      } else if (this.apis.substrate[key]) {
        this.apis.substrate[key].api?.disconnect();

        delete this.apis.substrate[key];
      }
    });

    if (this.ready) this.initNetworkStates();
    this.updateServiceInfo();

    this.networkMapSubject.next(this.networkMap);

    this.networkMapStore.set('NetworkMap', this.networkMap);
    this.networkMapSubject.next(this.networkMap);
    storage.set({ selectedNetworks: this.selectedNetworks });
  }

  getCurrentTabStatus() {
    return this.currentTabStatus;
  }

  async authorizeCancel({ id }: RequestAuthorizeCancel): Promise<boolean> {
    const queued = await this.requestService.getAuthRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    // Reject without error meaning cancel
    reject(new Error('Cancelled'));

    return true;
  }

  updateDefaultAuthAccounts(defaultAuthAccountSelection: string[]) {
    this.defaultAuthAccountSelection = defaultAuthAccountSelection;

    storage.set({ defaultAuthAccountSelection });
  }

  public getAllAddresses(): string[] {
    return Object.keys(accounts.subject.value);
  }

  public updateNetworkStatus(key: string, status: NETWORK_STATUS) {
    const networkKey = this.getNetworkByKey(key)?.name ?? '';

    if (this.networkMap[networkKey].networkStatus === status) return;

    this.networkMap[networkKey].networkStatus = status;

    this.networkMapSubject.next(this.networkMap);
    this.networkMapStore.set('NetworkMap', this.networkMap);
  }

  private signMobileComplete = (
    id: string,
    resolve: (result: ResponseSigning) => void,
    reject: (error: Error) => void
  ): Resolver<ResponseSigning> => {
    const complete = (): void => {
      delete this.mobileSignRequests[id];
      const allSignRequests = this.allMobileSignRequests();

      this.mobileSignSubject.next(allSignRequests);
    };

    return {
      reject: (error: Error): void => {
        complete();
        reject(error);
      },
      resolve: (result: ResponseSigning): void => {
        complete();
        resolve(result);
      },
    };
  };

  async removeAuthorization(url: string): Promise<AuthUrls> {
    const entries = await this.requestService.getAuthList();
    const entry = entries[url];

    assert(entry, `The source ${url} is not known`);

    delete entries[url];

    this.requestService.setAuthorize(entries);

    return entries;
  }

  async updateAuthorizedAccounts(authorizedAccountDiff: AuthorizedAccountsDiff): Promise<void> {
    const entries = await this.requestService.getAuthList();

    authorizedAccountDiff.forEach(([url, authorizedAccountDiff]) => {
      entries[url].authorizedAccounts = authorizedAccountDiff;
    });

    return this.requestService.setAuthorize(entries);
  }

  getMobileSignRequest(id: string): MobileSignRequest {
    return this.mobileSignRequests[id];
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

  findNetworkKeyByChainId(_chainId?: string | null): [string | undefined, NetworkJson | undefined] {
    if (!_chainId) return [undefined, undefined];

    const rs = Object.entries(this.networkMap).find(([, chainInfo]) => chainInfo.chainId === _chainId);

    if (rs) return rs;
    else return [undefined, undefined];
  }

  saveMetadata(meta: MetadataDef): void {
    this.requestService.saveMetadata(meta);

    addMetadata(meta);
  }

  signMobile(request: SignerPayloadRaw): Promise<ResponseSigning> {
    const id = getId();

    return new Promise((resolve, reject): void => {
      this.mobileSignRequests[id] = {
        ...this.signMobileComplete(id, resolve, reject),
        id,
        request,
      };

      this.mobileSignSubject.next([{ id, request }]);
    });
  }

  public getAccountAddress(): Promise<string> {
    return new Promise((resolve) => {
      this.getCurrentAccount((account) => resolve(account?.address ?? ''));
    });
  }

  get currentAccount() {
    return new Promise<CurrentAccountState>((res) => {
      this.getCurrentAccount((value) => {
        res(value);
      });
    });
  }

  public getCurrentAccount(update: (value: CurrentAccountState) => void = () => null): void {
    this.currentAccountStore.get('CurrentAccountInfo', update);
  }

  public refreshPrice() {
    const assets: string[] = this.assetsMap.filter(({ priceId }) => priceId).map(({ priceId }) => priceId);

    getTokenPrice(Array.from(new Set(assets)), this.fiatSymbol, this.prices)
      .then((rs) => {
        this.setPrice(rs);
      })
      .catch((err) => console.info(err));
  }

  public async publishBalance() {
    const balance = await this.balanceService.getBalance();

    return this.balanceService.updateBalance(balance);
  }

  public async prepNetworkJson() {
    const result: Record<string, NetworkJson> = {};
    const { data: networks } = await axios.get<NetworkJson[]>(URLS.CHAINS);
    const { data: xcmLocations } = await axios.get<XcmLocations>(URLS.XCM_LOCATIONS);
    const { data: xcmFees } = await axios.get<XcmFees>(URLS.XCM_FEES);

    // this.networksJson = networks.filter((el) => isSora(el.name));
    // this.networksJson = networks.filter((el) => el.name.toLowerCase() === 'kusama');

    this.networksJson = networks.filter((el) => !el.disabled);
    this.xcmLocations = xcmLocations;
    this.xcmFees = xcmFees;

    const networksFromStorage = await new Promise<Record<string, NetworkJson>>((res) => {
      this.networkMapStore.get('NetworkMap', (accountsFromStorage) => {
        res(accountsFromStorage);
      });
    });

    this.networksJson.forEach((network) => {
      const [{ url: currentProvider }] = network.nodes;
      const providers: Record<string, string> = {};

      network.nodes.forEach(({ name, url }) => (providers[name] = url));

      const isEthereum = isEthereumNetwork(network.name);
      const networkFromStorage = networksFromStorage ? networksFromStorage[network.name] : undefined;

      const favorite = networkFromStorage && networkFromStorage.favorite ? networkFromStorage.favorite : [];

      result[network.name] = {
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

    this.networkMapStore.set('NetworkMap', result);
    this.networkMap = result;

    this.getSubstrateAccounts().forEach((el) => {
      //Migration from old network managment
      if (!this.selectedNetworks[el.address]) this.selectedNetworks[el.address] = ALL_NETWORKS;
    });

    const currentAccount = await this.currentAccount;
    const activeNetworks = this.getActiveNetworks(currentAccount?.address ?? '');

    Object.keys(this.networkMap).forEach((key) => {
      const isExists = activeNetworks.some(({ name }) => name === key);

      this.networkMap[key].active = isExists;
    });

    this.getSubstrateAccounts().forEach(({ address }) => this.balanceService.generateDefaultBalance(address));
    this.ready = true; //Set true if chain json is parsed and data is preped for init apis
  }

  public async init() {
    await this.eventService.waitCryptoReady;
    await this.prepNetworkJson();

    this.initNetworkStates();
    this.onReady();
    this.updateServiceInfo();
  }

  resetApiRetries() {
    Object.values(this.getSubstrateApiMap).forEach((api) => {
      api.nodeIndex = 0;
      api.apiRetry = 0;
    });
  }

  public initNetworkStates() {
    const activeNetworks = Object.values(this.networkMap).filter(({ active }) => active);

    activeNetworks.forEach(async (network) => {
      const { name, isEthereum } = network;

      if (isEthereum && isRequireEvmAPI(name)) {
        if (!this.apis.evm[name] || !this.apis.evm[name].ready) this.initWeb3Api(network);
      } else {
        if (this.apis.substrate[name]) {
          const isReady = await this.apis.substrate[name].api?.isReady;

          if (isReady) return;
        }

        this.resetApiRetries();

        initApi(network, this);
      }
    });
  }

  public getWallets(): KeyringAddress[] {
    return [...this.keyringService.getAccounts(), ...this.keyringService.getAddresses()];
  }

  public setPrice(priceData: PriceJson, callback?: (priceData: PriceJson) => void): void {
    this.priceStore.set('PriceData', priceData, () => {
      if (callback) {
        callback(priceData);

        this.priceStoreReady = true;
      }
    });
  }

  public getPrice(update: (value: PriceJson) => void): void {
    this.priceStore.get('PriceData', (rs) => {
      if (this.priceStoreReady) update(rs);
      else {
        const assets: string[] = this.assetsMap.filter(({ priceId }) => priceId).map(({ priceId }) => priceId);

        getTokenPrice(Array.from(new Set(assets)), this.fiatSymbol, this.prices)
          .then((rs) => {
            this.setPrice(rs);
            update(rs);
          })
          .catch((err) => {
            throw err;
          });
      }
    });
  }

  public subscribePrice() {
    return this.priceStore.subject;
  }

  public getNetworkGenesisHashByKey(key: string) {
    const network = this.networkMap[key];

    return network && network.genesisHash;
  }

  public setCurrentAccount(data: CurrentAccountState, callback: () => void = () => null, updateNetworks = true): void {
    const cb = () => {
      if (updateNetworks) {
        this.setActiveNetworks();

        // logic for Sora library
        if (data?.address && !data.isMobile) {
          const pair = this.keyringService.getPair(data?.address)!;

          apiSora.account = { json: null as any, pair };

          // TODO добавить фича тогл
          this.subscribeTotalXorBalance();
        }
      } else this.updateServiceInfo();

      callback();
    };

    this.currentAccountStore.set('CurrentAccountInfo', data, cb);
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

  public getSubstrateAccounts() {
    const accounts = this.keyringService.getAccounts().filter((el) => !isEthereumAddress(el.address));
    const addresses = this.keyringService.getAddresses();

    return [...accounts, ...addresses];
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

  public subscribeNetworkMap() {
    return this.networkMapStore.subject;
  }

  async getCurrentAddress(network: NetworkName, _currentAccount?: CurrentAccountState) {
    const currentAccount = _currentAccount ?? (await this.currentAccount);

    return isEthereumNetwork(network) ? currentAccount!.ethereumAddress : currentAccount!.address;
  }

  getTimespan(name: keyof Timespans, address: string) {
    return this.timespans[name]?.[address] ?? 0;
  }

  saveTimespan(name: keyof Timespans, address: string, value: number) {
    if (!this.timespans[name]) this.timespans[name] = {};

    this.timespans[name]![address] = value;
  }

  getEvmTimeout(address: string) {
    return this.evmTimeouts[address] ?? 0;
  }

  saveEvmTimeout(address: string, value: NodeJS.Timer | null = null) {
    this.evmTimeouts[address] = value;
  }

  async fetchEvmBalance(_networks: NetworkName[] | null, _ethereumAddress?: string) {
    const currentAccount = await this.currentAccount;
    const ethereumAddress = _ethereumAddress ?? currentAccount?.ethereumAddress ?? '';

    if (ethereumAddress === '') return;

    const fetchBalances = () => {
      const networks = Object.values(this.networkMap).filter(({ name, active }) => {
        if (_networks !== null && !_networks.includes(name)) return false;

        if (!active) return false;

        if (!isRequireEvmAPI(name)) return false;

        return true;
      });

      networks.forEach(({ assets, name }) =>
        assets.forEach(({ id }) => fetchEvmAssetBalance(ethereumAddress, name, id, this))
      );

      this.saveTimespan('evmBalances', ethereumAddress, Date.now());
    };

    const timespan = Date.now() - this.getTimespan('evmBalances', ethereumAddress);

    if (timespan < REFRESH_TIME) {
      if (this.getEvmTimeout(ethereumAddress) !== null) clearTimeout(this.getEvmTimeout(ethereumAddress));

      const timeout = setTimeout(() => {
        fetchBalances();

        this.saveEvmTimeout(ethereumAddress);
      }, REFRESH_TIME - timespan);

      this.saveEvmTimeout(ethereumAddress, timeout);
    } else fetchBalances();
  }
}
