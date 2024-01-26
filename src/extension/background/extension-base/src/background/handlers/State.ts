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
  NftService,
} from '@extension-base/services';
import { api as apiSora, type FPNumber } from '@sora-substrate/util';
import NetworkMapStore from '@extension-base/stores/NetworkMap';
import { storage } from '@extension-base/stores/Storage';
import CustomTokenStore from '@extension-base/stores/CustomEvmToken';
import { initWeb3Api } from '@extension-base/api/evm';
import { getCurrentProvider, getId } from '@extension-base/utils/utils';
import { initApi } from '@extension-base/api/substrate/api';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { FWCron } from '@extension-base/background/cron';
import { isEthereumNetwork, isRequireEvmAPI } from '@extension-base/background/utils/utils';
import { withErrorLog } from '@extension-base/background/handlers/helpers';
import { FWSubscription, isSubscriptionRunning, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import { type KeyringAddress } from '@polkadot/ui-keyring/types';
import { type SignerPayloadRaw } from '@polkadot/types/types';
import {
  type ServiceInfo,
  type MobileSignRequest,
  type MobileSigningRequest,
  type ResponseSigning,
  type AuthUrls,
  type Resolver,
  type AuthorizedAccountsDiff,
  type RequestRpcSend,
  type RequestRpcSubscribe,
  type RequestRpcUnsubscribe,
  type ResponseRpcListProviders,
  type Port,
  type IState,
  type ActiveTabAuthorizeStatus,
  type Providers,
  type RequestAuthorizeCancel,
  type ApiProps,
  type RequestAccountExportPrivateKey,
  type ResponseAccountExportPrivateKey,
  type EvmApiMap,
} from '@extension-base/background/types/types';
import PricesService from '@extension-base/services/prices-service';
import { fetchEvmAssetBalance } from '@extension-base/api/evm/balance';
import { REFRESH_TIME } from '@extension-base/api/evm/utils/eth';
import BalanceService from '@extension-base/services/balance-service';
import CurrentAccountStore, {
  type CurrentAccountInfo,
  type CurrentAccountState,
} from '@extension-base/stores/CurrentAccountStore';
import WalletConnectDAppService from '@extension-base/services/wallet-connect-service/dapp';
import axios from 'axios';
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

export default class State {
  public cron: FWCron;
  public timespans: Timespans = {};
  public evmTimeouts: EvmTimeouts = {};
  public passwords: Passwords = {};
  public subscription: FWSubscription;
  public injectedProviders: Map<Port, ProviderInterface> = new Map();
  public providers: Providers = {};
  public chainRegistryMap: Record<string, ChainRegistry> = {};
  public chainRegistrySubject = new Subject<Record<string, ChainRegistry>>();
  public readonly unsubscriptionMap: Record<string, () => void> = {};
  private readonly currentAccountStore = new CurrentAccountStore();
  private readonly evmChainSubject = new Subject<AuthUrls>();
  private readonly authorizeUrlSubject = new Subject<AuthUrls>();
  public signature: HexString | null = null;
  public defaultAuthAccountSelection: string[] = [];
  public apis: APIs = {
    substrate: {},
    evm: {},
  };
  public xcmFees: XcmFees = [];
  public xcmLocations: XcmLocations = [];
  public networkMap: Record<string, NetworkJson> = {}; // mapping to networkMapStore, for uses in background
  public networksGithub: NetworkJson[] = []; // networks from github
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
  public requestService = new RequestService(this);
  public nftService = new NftService(this);
  public walletConnectService = new WalletConnectService(this, this.requestService);
  public walletConnectDappService = new WalletConnectDAppService(this);
  public soraCardService = new SoraCardService(this.requestService);
  public onboardingService = new OnboardingService();
  public stakingService = new StakingService(this);
  public balanceService = new BalanceService(this);
  public pricesService = new PricesService(this);

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

  public get assetsMap() {
    return Object.values(this.networkMap)
      .map(({ assets }) => assets)
      .flat();
  }

  public get getSubstrateApiMap() {
    return this.apis.substrate;
  }

  public getEvmApi(key: string) {
    return this.getEvmApiMap[key.toLowerCase()];
  }

  public getEvmApiByChainiD(chainId: string) {
    const network = Object.values(this.networkMap).find((network) => network.chainId === chainId);

    if (!network) throw new Error(`coudnt find the network with chainId ${chainId}`);

    const api = this.getEvmApi(network.name);

    if (!api) throw new Error(`api not init`);

    return api;
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

    if (fiatSymbol) this.pricesService.setFiatSymbol(fiatSymbol);
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
        this.apis.substrate[name].api?.disconnect();
        this.apis.substrate[name].provider?.disconnect();
        delete this.apis.substrate[name];
      }

      if (isEthereum && name in this.apis.evm) delete this.apis.evm[name];

      if (isEthereum && isRequireEvmAPI(name)) this.initWeb3Api(data);
      else initApi(data, this);
    }

    this.networkMapSubject.next(this.networkMap);
    this.networkMapStore.set('NetworkMap', this.networkMap);

    this.updateServiceInfo();

    return true;
  }

  public disableNetworkMap(networkKey: string): boolean {
    //if it's already disconnected then return true
    if (this.networkMap[networkKey].networkStatus === NETWORK_STATUS.DISCONNECTED) return true;

    if (this.networkMap[networkKey]?.isEthereum) delete this.apis.evm[networkKey];
    else delete this.apis.substrate[networkKey];

    this.networkMap[networkKey].active = false;
    this.networkMap[networkKey].networkStatus = NETWORK_STATUS.DISCONNECTED;

    this.networkMapSubject.next(this.networkMap);
    this.updateServiceInfo();
    this.networkMapStore.set('NetworkMap', this.networkMap);

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

    const { name } = network;
    const currentProvider = getCurrentProvider(network);
    if (currentProvider) this.apis.evm[name.toLowerCase()] = initWeb3Api(currentProvider);
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

  public getActiveNetworks() {
    const networks = Object.values(this.networkMap);
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

  public async setActiveNetworks(type: string) {
    const currentAccount = await this.currentAccount;

    if (!currentAccount) return;

    this.selectedNetworks[currentAccount.address] = type;

    const unsub = this.subscription.getSubscription('balance');
    unsub?.();

    const networks = this.getActiveNetworks();

    Object.keys(this.networkMap).forEach((key) => {
      const networkKey = key.toLowerCase();
      const network = this.networkMap[key];

      network.active = networks.some(({ name }) => name.toLowerCase() === networkKey);

      const isActive = network.active;

      if (!isActive && network.isEthereum && this.apis.evm[networkKey]) {
        this.apis.evm[networkKey].destroy();
        delete this.apis.evm[networkKey];
      } else if (!isActive && this.apis.substrate[networkKey]) {
        this.apis.substrate[networkKey].provider?.disconnect().then(() => {
          delete this.apis.substrate[networkKey];
        });
      }
    });

    if (this.ready) this.initNetworkStates();

    this.updateServiceInfo();

    this.networkMapSubject.next(this.networkMap);

    this.networkMapStore.set('NetworkMap', this.networkMap);
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

  public async publishBalance() {
    const balance = await this.balanceService.getBalance();

    return this.balanceService.updateBalance(balance);
  }

  public async prepNetworkJson() {
    const { data: networks } = await axios.get<NetworkJson[]>(URLS.CHAINS);
    const { data: xcmLocations } = await axios.get<XcmLocations>(URLS.XCM_LOCATIONS);
    const { data: xcmFees } = await axios.get<XcmFees>(URLS.XCM_FEES);

    this.networksGithub = networks;

    this.xcmLocations = xcmLocations;
    this.xcmFees = xcmFees;

    const networksFromStorage = await new Promise<Record<string, NetworkJson>>((res) => {
      this.networkMapStore.get('NetworkMap', (accountsFromStorage) => {
        res(accountsFromStorage);
      });
    });

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

    this.networkMapStore.set('NetworkMap', this.networkMap);

    this.getSubstrateAccounts().forEach((el) => {
      //Migration from old network management
      if (!this.selectedNetworks[el.address]) this.selectedNetworks[el.address] = ALL_NETWORKS;
    });

    const activeNetworks = this.getActiveNetworks();

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

    await this.initNetworkStates();
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

    for (const network of activeNetworks) {
      const { name, isEthereum } = network;

      if (isEthereum && isRequireEvmAPI(name)) {
        if (!this.apis.evm[name] || !this.apis.evm[name].ready) this.initWeb3Api(network);
      } else {
        const initSubstrateApies = () => {
          this.resetApiRetries();

          initApi(network, this);
        };

        if (this.apis.substrate[name]) {
          this.apis.substrate[name].api?.isReadyOrError.catch(initSubstrateApies);
        } else initSubstrateApies();
      }
    }
  }

  public getWallets(): KeyringAddress[] {
    return [...this.keyringService.getAccounts(), ...this.keyringService.getAddresses()];
  }

  public getNetworkGenesisHashByKey(key: string) {
    const network = this.networkMap[key];

    return network && network.genesisHash;
  }

  public updateNetworkForNewWallet(address: string) {
    this.setActiveNetworks(this.selectedNetworks[address] ?? ALL_NETWORKS);
  }

  public updateCurrentAccount(address: string, isNew = true): boolean {
    if (isEthereumAddress(address)) return false;

    this.balanceService.generateDefaultBalance(address);

    this.saveCurrentAccountAddress(address, () => {
      this.keyringService.triggerWalletsSubscription();

      if (isNew) this.setActiveNetworks(this.selectedNetworks[address] ?? ALL_NETWORKS);
    });

    return true;
  }

  public setCurrentAccount(data: CurrentAccountState, callback: () => void = () => null, updateNetworks = true): void {
    const cb = () => {
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
    };

    this.currentAccountStore.set('CurrentAccountInfo', data, cb);
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
    if (this.selectedNetworks[address]) {
      delete this.selectedNetworks[address];

      storage.set({ selectedNetworks: this.selectedNetworks });
    }

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
    return this.timespans[name]?.[address] ?? Number.MIN_VALUE;
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
    if (!this.ready) return;

    const currentAccount = await this.currentAccount;
    const ethereumAddress = _ethereumAddress ?? currentAccount?.ethereumAddress ?? '';

    if (ethereumAddress === '') return;

    const fetchBalances = () => {
      const networks = Object.values(this.networkMap).filter(({ name, active }) => {
        if (_networks !== null && !_networks.includes(name)) return false;

        if (!active || !isRequireEvmAPI(name)) return false;

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
