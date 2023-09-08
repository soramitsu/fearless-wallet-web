import { BehaviorSubject, Subject } from 'rxjs';
import { addMetadata, knownMetadata } from '@polkadot/extension-chains';
import { isEthereumAddress, base64Decode } from '@polkadot/util-crypto';

import { assert, u8aToHex } from '@polkadot/util';
import { TypeRegistry } from '@polkadot/types';
import { accounts } from '@polkadot/ui-keyring/observable/accounts';
import { decodePair } from '@polkadot/keyring/pair/decode';
import { keyring } from '@polkadot/ui-keyring';
import { api as apiSora, FPNumber } from '@sora-substrate/util';
import NetworkMapStore from '@extension-base/stores/NetworkMap';
import { storage } from '@extension-base/stores/Storage';
import CustomTokenStore from '@extension-base/stores/CustomEvmToken';
import BalanceService from '@extension-base/shared/balanceService';
import { initWeb3Api } from '@extension-base/api/evm';
import PriceStore from '@extension-base/stores/Price';
import { getTokenPrice } from '@extension-base/utils/coingecko';
import { getCurrentProvider, getId } from '@extension-base/utils/utils';
import { initApi } from '@extension-base/api/substrate/api';
import { axios } from '@extension-base/utils/axios';
import { prepNetworkNames } from '@extension-base/const/networks';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { FWCron } from '@extension-base/background/cron';
import { getMockCurrencies, isEthereumNetwork, isRequireSubstrateAPI } from '@extension-base/background/utils/utils';
import { withErrorLog } from '@extension-base/background/handlers/helpers';
import { FWSubscription, isSubscriptionRunning, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import { JsonRpcProvider } from 'ethers';
import { KeyringAddress } from '@polkadot/ui-keyring/types';
import {
  EventService,
  SoraCardService,
  OnboardingService,
  WalletConnectService,
  NetworkService,
  RequestService,
} from '@extension-base/services';
import CurrentAccountStore, { CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import {
  MobileSigningRequest,
  ApiProps,
  PriceJson,
  BalanceJson,
  MobileSignRequest,
  RequestAccountExportPrivateKey,
  ResponseAccountExportPrivateKey,
} from '../types';
import type { AuthorizeRequest, MetadataRequest, ServiceInfo } from '@extension-base/background/types';
import type { SignerPayloadRaw } from '@polkadot/types/types';
import type {
  AuthUrls,
  ResponseSigning,
  Resolver,
  AuthorizedAccountsDiff,
  RequestRpcSend,
  RequestRpcSubscribe,
  RequestRpcUnsubscribe,
  ResponseRpcListProviders,
  Port,
  IState,
  ActiveTabAuthorizeStatus,
  BalanceMap,
  Providers,
  ResponseTotalBalances,
  RequestAuthorizeCancel,
  SigningRequest,
} from '@extension-base/background/types/types';
import type { BalanceItem, CustomTokenJson } from '@extension-base/api/evm/types/ether';
import type { ChainRegistry, NetworkJson } from '@extension-base/types';
import type { JsonRpcResponse, ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';
import type { HexString } from '@polkadot/util/types';
import type { SoraFees, XcmLocations, XcmFees, NetworkName } from '@/interfaces';
import { URLS } from '@/consts/urls';
import {
  ALL_NETWORKS,
  FAVORITE_NETWORKS,
  POPULAR_NETWORKS,
  SORA_NETWORK_NAME,
  SORA_XOR_ASSET_ID,
} from '@/consts/networks';
import { getChangeWalletBalance, getSummaryTransferableWalletBalance } from '@/helpers/common';

export const cacheRegistryMap: Record<string, ChainRegistry> = {};

export const registry = new TypeRegistry();
type APIs = {
  evm: Record<NetworkName, JsonRpcProvider>;
  substrate: Record<NetworkName, ApiProps>;
};

export default class State {
  private cron: FWCron;
  public prices: {
    json: PriceJson;
    timestamp: number;
  } = {
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
  public balanceMap: BalanceMap = {};
  public balanceSubject = new Subject<BalanceJson>();
  public customTokenState: CustomTokenJson = { erc20: [] };
  public customTokenSubject = new Subject<CustomTokenJson>();
  public customTokenStore = new CustomTokenStore();
  public mobileSignRequests: Record<string, MobileSignRequest> = {};
  public readonly authSubject = new BehaviorSubject<AuthorizeRequest[]>([]);
  public readonly metaSubject = new BehaviorSubject<MetadataRequest[]>([]);
  public readonly signSubject = new BehaviorSubject<SigningRequest[]>([]);
  public readonly mobileSignSubject = new BehaviorSubject<MobileSigningRequest[]>([]);
  public balanceService = new BalanceService();
  public lazyMap: Record<string, unknown> = {};
  public soraFees: SoraFees = {} as SoraFees;
  public ready = false;
  public currentTabStatus: ActiveTabAuthorizeStatus = {
    isAuthorize: false,
    authorizeAccountsCount: 0,
    dAppName: '',
  };
  public eventService = new EventService();
  public networkService = new NetworkService(this.eventService);
  public requestService = new RequestService(this, this.networkService);
  public walletConnectService = new WalletConnectService(this, this.requestService);
  public soraCardService = new SoraCardService(this.requestService);
  public onboardingService = new OnboardingService();

  public get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }

  constructor() {
    this.injectFromStorage();
    this.onboardingService.init();
    this.subscription = new FWSubscription(this);
    this.cron = new FWCron(this, this.subscription);
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
      url.hostname === 'nhlnehondigmgckngjomcpcefcdplmgc' || url.hostname === '39fb1478-3519-4b4e-8eba-15e6e594494c'
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
      this.setCurrentAccount({ ...currentAccount });

      return;
    }

    const accounts = this.getSubstrateAccounts();

    if (accounts.length) {
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

      return;
    }

    this.setCurrentAccount(null);
  }

  public upsertNetworkMap(data: NetworkJson): boolean {
    if (this.lockNetworkMap) return false;

    this.lockNetworkMap = true;
    const { name, currentProvider, chain, blockExplorer, paraId, nativeToken, decimals, customNodes } = data;

    if (name in this.networkMap) {
      const network = this.networkMap[name];
      //make network active if it was disabled previously
      network.active = true;
      // update provider for existed network
      network.customNodes = customNodes;

      if (currentProvider !== network.currentProvider && currentProvider) {
        network.currentProvider = currentProvider;
      }

      network.chain = chain;

      if (nativeToken) network.nativeToken = nativeToken;

      if (decimals) network.decimals = decimals;

      network.paraId = paraId;
      network.blockExplorer = blockExplorer;
    } else {
      // insert
      this.networkMap[name] = data;
    }

    if (this.networkMap[name].active) {
      // update API map if network is active
      if (data.name in this.apis.substrate) {
        this.apis.substrate[name].api?.disconnect && this.apis.substrate[name].api?.disconnect();
        delete this.apis.substrate[name];
      }

      if (data.isEthereum && name in this.apis.evm) delete this.apis.evm[name];

      if (currentProvider) {
        initApi(data);

        if (data.isEthereum && data.isEthereum && !isRequireSubstrateAPI(data.name)) {
          this.apis.evm[data.name] = initWeb3Api(currentProvider);
        }
      }
    }

    this.networkMapSubject.next(this.networkMap);
    this.networkMapStore.set('NetworkMap', this.networkMap);
    this.updateServiceInfo();
    this.lockNetworkMap = false;

    return true;
  }

  public disableNetworkMap(networkKey: string): boolean {
    if (this.lockNetworkMap) return false; // todo ???

    this.lockNetworkMap = true; // todo ???
    const network = this.networkMap[networkKey];

    delete this.apis.substrate[networkKey];

    if (network.isEthereum) delete this.apis.evm[networkKey]; // todo аналогично

    network.active = false;
    network.apiStatus = NETWORK_STATUS.DISCONNECTED;
    this.networkMapSubject.next(this.networkMap);
    this.updateServiceInfo();
    this.networkMapStore.set('NetworkMap', this.networkMap);
    this.lockNetworkMap = false;

    this.requestService.getAuthorize((data) => {
      if (network.isEthereum) this.evmChainSubject.next(data);

      this.authorizeUrlSubject.next(data);
    });

    return true;
  }

  public async enableNetworkType(type: string): Promise<void> {
    const currentAccount = await this.currentAccount;

    if (currentAccount) {
      this.selectedNetworks[currentAccount.address] = type;

      storage.set({ selectedNetworks: this.selectedNetworks });
    }

    return this.setActiveNetworks(type);
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

  public refreshWeb3Api(key: string) {
    const currentProvider = getCurrentProvider(this.networkMap[key]);

    if (currentProvider) this.apis.evm[key] = initWeb3Api(currentProvider);
  }

  public refreshDotSamaApi(key: string) {
    const network = this.networkMap[key];
    const api = this.getSubstrateApiMap[key];

    if (api) {
      api.nodeIndex = 0;
      api.apiRetry = 0;
    }

    if (network && network.apiStatus && network.apiStatus === NETWORK_STATUS.DISCONNECTED) initApi(network);
  }

  public getNetworkByKey(key: string): NetworkJson | undefined {
    return Object.values(this.networkMap).find((network) => network.name.toLowerCase() === key.toLowerCase());
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

  public selectedNetworksExceptAddress(address: string): string[] {
    const result: string[] = [];
    Object.keys(this.selectedNetworks).forEach((el) => {
      if (el !== address) result.push(this.selectedNetworks[el]);
    });

    return result;
  }

  public isPopularNetworksSelected(network: NetworkJson, address: string) {
    const networks = this.selectedNetworksExceptAddress(address);

    return network.rank !== undefined && networks.some((el) => el === POPULAR_NETWORKS);
  }

  public isNetworkSelectedInAnotherWallet(network: NetworkJson, selectedType: string, address: string) {
    if (Object.values(this.selectedNetworks).some((el) => el === ALL_NETWORKS)) return true;
    if (this.isPopularNetworksSelected(network, address)) return true;
    if (this.isFavoriteNetworkSelected(network, address)) return true;
    if (this.isSingleNetworkSelected(selectedType, address)) return true;

    return false;
  }

  public isSingleNetworkSelected(selectedType: string, address: string) {
    const networks = this.selectedNetworksExceptAddress(address);
    const isTypeAlreadySelected = networks.some((network) => network === selectedType);
    const isNotGroup =
      selectedType !== ALL_NETWORKS && selectedType !== POPULAR_NETWORKS && selectedType !== FAVORITE_NETWORKS;

    return isNotGroup && isTypeAlreadySelected;
  }

  public isFavoriteNetworkSelected(network: NetworkJson, address: string) {
    const favorites = network.favorite.filter((el) => el !== address);

    return favorites.some((el) => this.selectedNetworks[el] === FAVORITE_NETWORKS);
  }

  public async setActiveNetworks(type: string) {
    const currentAccount = await this.currentAccount;

    if (!currentAccount) return;

    this.subscription.stop();
    this.cron.stop();

    Object.keys(this.networkMap).forEach((key) => {
      const network = this.networkMap[key];
      const { name } = network;
      const isFavorite = network.favorite.some((address) => address === currentAccount.address);
      const isAlreadySelectedType = this.isNetworkSelectedInAnotherWallet(network, type, currentAccount.address);

      switch (type) {
        case ALL_NETWORKS:
          network.active = true;

          break;
        case FAVORITE_NETWORKS:
          if (isFavorite) {
            network.active = true;

            break;
          }

          if (isAlreadySelectedType) break;

          network.active = false;

          break;
        case POPULAR_NETWORKS:
          if (network.rank !== undefined) {
            network.active = true;
            break;
          }

          if (isAlreadySelectedType) break;

          network.active = false;
          break;
        default: //type = single network, like Moonriver etc
          if (isAlreadySelectedType) break;

          network.active = type === network.name;
      }

      if (!network.active) {
        if (this.apis.substrate[name]) {
          this.apis.substrate[name].provider?.disconnect();
          delete this.apis.substrate[name];
        } else if (this.apis.evm[name]) {
          this.apis.evm[name].provider.destroy();
          delete this.apis.evm[name];
        }
      }
    });

    this.networkMapSubject.next(this.networkMap);
    this.networkMapStore.set('NetworkMap', this.networkMap);
    this.updateServiceInfo();

    this.initNetworkStates(true);
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

  public updateNetworkStatus(networkKey: string, status: NETWORK_STATUS) {
    if (this.networkMap[networkKey].apiStatus === status) return;

    this.networkMap[networkKey].apiStatus = status;

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

  public getAccountAddress(): Promise<string | null | undefined> {
    return new Promise((resolve) => {
      this.getCurrentAccount((account) => {
        account ? resolve(account.address) : resolve(null);
      });
    });
  }

  get currentAccount() {
    return new Promise<CurrentAccountState>((res) => {
      this.getCurrentAccount((value) => {
        res(value);
      });
    });
  }

  public getCurrentAccount(update: (value: CurrentAccountState) => void): void {
    this.currentAccountStore.get('CurrentAccountInfo', update);
  }

  public refreshPrice() {
    const assets: string[] = this.assetsMap.filter(({ priceId }) => priceId).map(({ priceId }) => priceId);

    getTokenPrice(Array.from(new Set(assets)), this.fiatSymbol)
      .then((rs) => {
        this.setPrice(rs);
      })
      .catch((err) => console.info(err));
  }

  public publishBalance(reset?: boolean) {
    return this.getBalance(reset).then((balance) => this.balanceSubject.next(balance));
  }

  public resetBalanceMap() {
    return this.publishBalance(true);
  }

  public async prepNetworkJson() {
    const result: Record<string, NetworkJson> = {};
    const { data: networks } = await axios.get<NetworkJson[]>(URLS.CHAINS);
    const { data: xcmLocations } = await axios.get<XcmLocations>(URLS.XCM_LOCATIONS);
    const { data: xcmFees } = await axios.get<XcmFees>(URLS.XCM_FEES);

    this.networksJson = networks.filter((el) => !el.disabled);
    this.xcmLocations = xcmLocations;
    this.xcmFees = xcmFees;
    const networksFromStorage = await new Promise<Record<string, NetworkJson>>((res) => {
      this.networkMapStore.get('NetworkMap', (accountsFromStorage) => {
        res(accountsFromStorage);
      });
    });

    this.networksJson.forEach((network) => {
      const prepCurrentProvider = network.nodes[0].url;
      const prepNodes: Record<string, string> = {};

      network.nodes.forEach((node) => {
        prepNodes[node.name] = node.url;
      });

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
        providers: prepNodes,
        currentProvider: prepCurrentProvider,
      };
    });

    this.networkMapStore.set('NetworkMap', result);
    this.networkMap = result;

    this.generateDefaultBalanceMap();
  }

  public async init() {
    await this.eventService.waitCryptoReady;
    await this.prepNetworkJson();

    this.initNetworkStates();
    this.updateServiceInfo();
  }

  resetApiRetries() {
    Object.values(this.getSubstrateApiMap).forEach((api) => {
      api.nodeIndex = 0;
      api.apiRetry = 0;
    });
  }

  public initNetworkStates(reset?: boolean) {
    this.networkMapStore.get('NetworkMap', async (storedNetworkMap) => {
      for (const [key, network] of Object.entries(storedNetworkMap)) {
        if (network.active) {
          if (network.isEthereum && !isRequireSubstrateAPI(key)) {
            this.apis.evm[key] = initWeb3Api(network.currentProvider);
          } else {
            if (reset) this.resetApiRetries();
            initApi(network);
          }
        }
      }

      this.onReady();
    });
  }

  public getWallets(): KeyringAddress[] {
    return [...keyring.getAccounts(), ...keyring.getAddresses()];
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

        getTokenPrice(Array.from(new Set(assets)), this.fiatSymbol)
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
    return this.priceStore.getSubject();
  }

  public async updateXorTotalBalance(muchTotal: FPNumber): Promise<void> {
    const currentAccount = await this.currentAccount;
    if (!currentAccount) return;

    const { address } = currentAccount;

    const currencyIndex = this.balanceMap[address].findIndex(({ assetId }) => assetId === SORA_XOR_ASSET_ID);

    const token = this.balanceMap[address][currencyIndex];
    const index = token.balances.findIndex(({ name }) => name.toLowerCase() === SORA_NETWORK_NAME);

    this.balanceMap[address][currencyIndex].balances[index].muchTotal = muchTotal.toString();
  }

  public setBalanceItem(networkKey: string, item: Partial<BalanceItem>, address: string) {
    const { reserved, free, locked, frozen, total, transferable, state, id, relayChain, symbol } = item;

    const balancesByAddress = this.balanceMap[address];
    const currencyIndex = balancesByAddress.findIndex(
      ({ assetId: _assetId, symbol: _symbol, relayChain: _relayChain }) => {
        const isExistingAssetId = _assetId === id;
        const isExistingDisplayName = _symbol === symbol;
        const isExistingAsset = isExistingDisplayName && _relayChain === relayChain;

        return isExistingAssetId || isExistingAsset;
      }
    );

    const asset = balancesByAddress[currencyIndex];
    const assetIndex = asset.balances.findIndex(({ name }) => {
      const key = prepNetworkNames[name] ?? name;

      return key === networkKey;
    });

    const balanceItem = asset.balances[assetIndex];

    asset.balances[assetIndex] = {
      ...balanceItem,
      reserved,
      free,
      locked,
      frozen,
      total,
      transferable,
      state: state!,
      timestamp: +new Date(),
    };

    this.updateBalanceStore(networkKey, item);

    this.lazyNext('setBalanceItem', () => this.publishBalance());
  }

  public getNetworkGenesisHashByKey(key: string) {
    const network = this.networkMap[key];

    return network && network.genesisHash;
  }

  public setCurrentAccount(data: CurrentAccountState, callback?: () => void): void {
    this.currentAccountStore.set('CurrentAccountInfo', data, () => {
      this.updateServiceInfo();

      // logic for Sora library
      if (data?.address && !data.isMobile) {
        const pair = keyring.getPair(data?.address);

        apiSora.account = { json: null as any, pair };

        this.subscribeTotalXorBalance();
      }

      callback && callback();
    });
  }

  public subscribeTotalXorBalance() {
    if (!apiSora.api || !apiSora.api.isConnected) return;

    try {
      const subscription = apiSora.assets
        .getTotalXorBalanceObservable()
        .subscribe((xorTotalBalance: FPNumber) => this.updateXorTotalBalance(xorTotalBalance));

      this.subscription.updateSubscription('xorTotalBalance', subscription.unsubscribe);
    } catch (ex) {
      console.error('failed subscribe or unsubscribe to XOR balance');
    }
  }

  private updateBalanceStore(networkKey: string, item: Partial<BalanceItem>) {
    this.getCurrentAccount((currentAccountInfo) => {
      if (currentAccountInfo)
        this.balanceService
          .updateBalanceStore(networkKey, currentAccountInfo.address, item)
          .catch((e) => console.warn(e));
    });
  }

  public getSubstrateAccounts() {
    const accounts = keyring.getAccounts().filter((el) => !isEthereumAddress(el.address));
    const addresses = keyring.getAddresses();

    return [...accounts, ...addresses];
  }

  public generateDefaultBalance(address: string) {
    if (address === '') return;

    if (this.balanceMap && this.balanceMap[address] !== undefined) return;

    this.balanceMap[address] = getMockCurrencies(this.networksJson);
  }

  public generateDefaultBalanceMap() {
    this.getSubstrateAccounts().forEach(({ address }) => this.generateDefaultBalance(address));
  }

  public accountExportPrivateKey({
    address,
    password,
  }: RequestAccountExportPrivateKey): ResponseAccountExportPrivateKey {
    const json = keyring.getPair(address).toJson(password);
    const decoded = decodePair(password, base64Decode(json.encoded), json.encoding.type);

    return {
      privateKey: u8aToHex(decoded.secretKey),
      publicKey: u8aToHex(decoded.publicKey),
    };
  }

  async getTotalBalances(): Promise<ResponseTotalBalances[]> {
    return new Promise<ResponseTotalBalances[]>((res) =>
      this.getPrice((prices) => {
        const balances: BalanceMap = { ...this.balanceMap };

        const totalBalances = Object.keys(balances).map((account) => {
          const total = getSummaryTransferableWalletBalance(balances[account], prices, ALL_NETWORKS);
          const change = getChangeWalletBalance(balances[account], prices, ALL_NETWORKS);

          return {
            address: account,
            total,
            change,
          };
        });

        res(totalBalances);
      })
    );
  }

  public async getBalance(reset = false): Promise<BalanceJson> {
    const account = await this.currentAccount;

    if (account)
      return new Promise((resolve) => {
        resolve({ details: this.balanceMap[account.address] ?? [], reset });
      });

    return { details: [], reset };
  }

  private lazyNext = (key: string, callback: () => void) => {
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
    return this.networkMapStore.getSubject();
  }
}
