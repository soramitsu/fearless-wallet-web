import { BehaviorSubject, Subject } from 'rxjs';
import { addMetadata, knownMetadata } from '@polkadot/extension-chains';
import { knownGenesis } from '@polkadot/networks/defaults';
import { assert, u8aToHex } from '@polkadot/util';
import { TypeRegistry } from '@polkadot/types';
import { accounts } from '@polkadot/ui-keyring/observable/accounts';
import { base64Decode, isEthereumAddress } from '@polkadot/util-crypto';
import { decodePair } from '@polkadot/keyring/pair/decode';
import { EventService, SoraCardService, OnboardingService, KeyringService } from '@extension-base/services';
import { api as apiSora, FPNumber } from '@sora-substrate/util';
import NetworkMapStore from '@extension-base/stores/NetworkMap';
import MetadataStore from '@extension-base/stores/Metadata';
import { storage } from '@extension-base/stores/Storage';
import CustomTokenStore from '@extension-base/stores/CustomEvmToken';
import BalanceService from '@extension-base/shared/balanceService';
import AuthorizeStore from '@extension-base/stores/Authorize';
import { initWeb3Api } from '@extension-base/api/evm';
import PriceStore from '@extension-base/stores/Price';
import { getTokenPrice } from '@extension-base/utils/coingecko';
import { getCurrentProvider, getId } from '@extension-base/utils/utils';
import { initApi } from '@extension-base/api/substrate/api';
import { axios } from '@extension-base/utils/axios';
import { prepNetworkNames } from '@extension-base/const/networks';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { FWCron } from '@extension-base/background/cron';
import {
  getMockCurrencies,
  getSubstrateAddress,
  isEthereumNetwork,
  isRequireEvmAPI,
} from '@extension-base/background/utils/utils';
import { MobileSigningRequest, MobileSignRequest, POPUP_WINDOW_OPTS } from '@extension-base/background/types/types';
import { stripUrl, withErrorLog } from '@extension-base/background/handlers/helpers';
import { FWSubscription, isSubscriptionRunning, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import { SignerPayloadRaw } from '@polkadot/types/types';
import { KeyringAddress } from '@polkadot/ui-keyring/types';

import CurrentAccountStore, { CurrentAccountState } from '../../stores/CurrentAccountStore';
import { fetchEvmAssetBalance } from '../../api/evm/balance';
import type {
  AuthorizeRequest,
  AuthRequest,
  AuthResponse,
  AuthUrls,
  MetadataRequest,
  MetaRequest,
  ResponseSigning,
  SigningRequest,
  SignRequest,
  Resolver,
  AuthorizedAccountsDiff,
  AccountJson,
  RequestAuthorizeTab,
  RequestRpcSend,
  RequestRpcSubscribe,
  RequestRpcUnsubscribe,
  RequestSign,
  ResponseRpcListProviders,
  Port,
  RequestAuthorizeCancel,
  IState,
  ActiveTabAuthorizeStatus,
  ApiProps,
  BalanceJson,
  PriceJson,
  RequestAccountExportPrivateKey,
  ResponseAccountExportPrivateKey,
  ServiceInfo,
  BalanceMap,
  Providers,
  ResponseTotalBalances,
  EvmApiMap,
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
import { EXTENSION_ID } from '@/consts/global';

function extractMetadata(store: MetadataStore): void {
  store.allMap((map): void => {
    const knownEntries = Object.entries(knownGenesis);
    const defs: Record<string, { def: MetadataDef; index: number; key: string }> = {};
    const removals: string[] = [];

    Object.entries(map).forEach(([key, def]): void => {
      const entry = knownEntries.find(([, hashes]) => hashes.includes(def.genesisHash));

      if (entry) {
        const [name, hashes] = entry;
        const index = hashes.indexOf(def.genesisHash);

        // flatten the known metadata based on the genesis index
        // (lower is better/newer)
        if (!defs[name] || defs[name].index > index) {
          if (defs[name]) {
            // remove the old version of the metadata
            removals.push(defs[name].key);
          }

          defs[name] = { def, index, key };
        }
      } else {
        // this is not a known entry, so we will just apply it
        defs[key] = { def, index: 0, key };
      }
    });

    removals.forEach((key) => store.remove(key));

    Object.values(defs).forEach(({ def }) => addMetadata(def));
  });
}

export const registry = new TypeRegistry();

type APIs = {
  evm: EvmApiMap;
  substrate: Record<NetworkName, ApiProps>;
};

type Timespans = {
  evmBalances?: Record<string, number>;
};

export type Prices = {
  json: PriceJson;
  timestamp: number;
};

const metaStore = new MetadataStore();

export default class State {
  public notification = 'popup';
  public cron: FWCron;
  public timespans: Timespans = {};
  public windows: number[] = [];
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
  private readonly authorizeStore = new AuthorizeStore();
  private readonly currentAccountStore = new CurrentAccountStore();
  private readonly priceStore = new PriceStore();
  private readonly evmChainSubject = new Subject<AuthUrls>();
  private readonly authorizeUrlSubject = new Subject<AuthUrls>();
  public authUrls: AuthUrls = {};
  public signature: HexString | null = null;
  public defaultAuthAccountSelection: string[] = [];
  private lockNetworkMap = false;
  public apis: APIs = {
    substrate: {},
    evm: {},
  };
  private priceStoreReady = false;
  public fiatSymbol = 'usd';
  public authorizeCached: AuthUrls | undefined = undefined;
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
  public authRequests: Record<string, AuthRequest> = {};
  public metaRequests: Record<string, MetaRequest> = {};
  public signRequests: Record<string, SignRequest> = {};
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
  public keyringService = new KeyringService(this);
  public eventService = new EventService();
  public soraCardService = new SoraCardService();
  public onboardingService = new OnboardingService();
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

  public setAuthorize(data: AuthUrls, callback?: () => void): void {
    this.authorizeStore.set('authUrls', data, () => {
      this.authorizeCached = data;
      this.evmChainSubject.next(this.authorizeCached);
      this.authorizeUrlSubject.next(this.authorizeCached);
      callback && callback();
    });
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

  private numAuthRequests() {
    return Object.keys(this.authRequests).length;
  }

  private numMetaRequests() {
    return Object.keys(this.metaRequests).length;
  }

  private numSignRequests() {
    return Object.keys(this.signRequests).length;
  }

  public isReady() {
    return this.ready;
  }

  public allAuthRequests(): AuthorizeRequest[] {
    return Object.values(this.authRequests).map(({ id, request, url }): AuthorizeRequest => ({ id, request, url }));
  }

  public allMetaRequests(): MetadataRequest[] {
    return Object.values(this.metaRequests).map(({ id, request, url }): MetadataRequest => ({ id, request, url }));
  }

  public allSignRequests(): SigningRequest[] {
    return Object.values(this.signRequests).map(
      ({ account, id, request, url }): SigningRequest => ({ account, id, request, url })
    );
  }

  public allMobileSignRequests(): MobileSigningRequest[] {
    return Object.values(this.mobileSignRequests).map(({ id, request }): MobileSigningRequest => ({ id, request }));
  }

  popupClose(): void {
    this.windows.forEach((id: number) => withErrorLog(() => chrome.windows.remove(id)));

    this.windows = [];
  }

  popupOpen(): void {
    if (this.notification && this.notification !== 'extension')
      chrome.windows.getCurrent((win) => {
        const popupOptions = { ...POPUP_WINDOW_OPTS };

        if (win) {
          popupOptions.left = (win.left || 0) + (win.width || 0) - (POPUP_WINDOW_OPTS.width || 0) - 20;
          popupOptions.top = (win.top || 0) + 75;
        }

        chrome.windows.create(popupOptions, (window): void => {
          if (window) this.windows.push(window.id || 0);
        });
      });
  }

  async injectFromStorage() {
    extractMetadata(metaStore);

    const {
      authUrls,
      defaultAuthAccountSelection,
      fiatSymbol,
      injectedProviders,
      providers,
      windows,
      selectedNetworks,
    } = await this.getFromStorage([
      'fiatSymbol',
      'authUrls',
      'selectedNetworks',
      'defaultAuthAccountSelection',
      'injectedProviders',
      'selectedNetworks',
      'providers',
      'windows',
    ]);
    if (authUrls && Object.keys(authUrls).length) this.authUrls = authUrls;
    if (windows && windows.length) this.windows = windows;
    if (fiatSymbol) this.setFiatSymbol(fiatSymbol);
    if (selectedNetworks) this.selectedNetworks = selectedNetworks;
    if (injectedProviders) this.injectedProviders = new Map(injectedProviders);
    if (providers) this.providers = providers;
    if (defaultAuthAccountSelection && defaultAuthAccountSelection.length)
      this.defaultAuthAccountSelection = defaultAuthAccountSelection;
  }

  approvePolkaswap = async (authorizedAccounts: string[]): Promise<void> => {
    this.soraCardService.approvePolkaswap(authorizedAccounts, this.authUrls);

    await this.saveCurrentAuthList();

    this.updateDefaultAuthAccounts(authorizedAccounts);
  };

  authComplete = (
    id: string,
    resolve: (resValue: AuthResponse) => void,
    reject: (error: Error) => void
  ): Resolver<AuthResponse> => {
    const complete = async (authorizedAccounts: string[] = [], isAllowed = true) => {
      const {
        id: idStr,
        request: { origin },
        url,
      } = this.authRequests[id];

      if (!isAllowed) {
        delete this.authRequests[id];
        this.updateIconAuth(true);

        return;
      }

      const stripedUrl = stripUrl(url);

      this.authUrls[stripedUrl] = {
        authorizedAccounts,
        count: 0,
        isAllowed: true,
        isAllowedMap: {},
        id: idStr,
        origin,
        url,
      };

      await this.saveCurrentAuthList();

      this.updateDefaultAuthAccounts(authorizedAccounts);

      delete this.authRequests[id];

      this.updateIconAuth(true);
    };

    return {
      reject: (error: Error): void => {
        complete([], false);
        reject(error);
      },
      resolve: ({ authorizedAccounts, result }: AuthResponse): void => {
        complete(authorizedAccounts);
        resolve({ authorizedAccounts, result });
      },
    };
  };

  public getAuthorize(update: (value: AuthUrls) => void): void {
    // This action can be use many by DApp interaction => caching it in memory
    if (this.authorizeCached) {
      update(this.authorizeCached);
    } else {
      this.authorizeStore.get('authUrls', (data) => {
        this.authorizeCached = data;
        update(this.authorizeCached);
      });
    }
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
    const tabHostName =
      url.hostname === EXTENSION_ID || url.hostname === '39fb1478-3519-4b4e-8eba-15e6e594494c'
        ? 'header.currentExtensionPage'
        : url.hostname;

    const authorizeUrl = Object.keys(this.authUrls).filter((url) => url === tabHostName);
    const isAuthorize = authorizeUrl.length !== 0;

    this.currentTabStatus = {
      isAuthorize,
      authorizeAccountsCount: isAuthorize ? this.authUrls[tabHostName].authorizedAccounts.length : 0,
      dAppName: tabHostName,
    };
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

    const { name, currentProvider, chain, blockExplorer, paraId, nativeToken, decimals, customNodes, isEthereum } =
      data;

    if (name in this.networkMap) {
      const network = this.networkMap[name];
      //make network active if it was disabled previously
      network.active = true;
      // update provider for existed network
      network.customNodes = customNodes;

      if (currentProvider !== network.currentProvider && currentProvider) network.currentProvider = currentProvider;

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

    if (this.networkMap[networkKey].isEthereum) delete this.apis.evm[networkKey];
    else delete this.apis.substrate[networkKey];

    this.networkMap[networkKey].active = false;
    this.networkMap[networkKey].networkStatus = NETWORK_STATUS.DISCONNECTED;

    this.networkMapSubject.next(this.networkMap);
    this.updateServiceInfo();
    this.networkMapStore.set('NetworkMap', this.networkMap);

    this.lockNetworkMap = false;

    this.getAuthorize((data) => {
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

      if (currentProvider) this.apis.evm[name] = initWeb3Api(currentProvider);
    });
  }

  public refreshDotSamaApi(key: string) {
    if (this.getSubstrateApiMap[key]) {
      this.getSubstrateApiMap[key].nodeIndex = 0;
      this.getSubstrateApiMap[key].apiRetry = 0;
    }

    initApi(this.networkMap[key], this);
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

    await this.initNetworkStates(true);
    this.updateServiceInfo();

    this.networkMapSubject.next(this.networkMap);

    this.networkMapStore.set('NetworkMap', this.networkMap);
    storage.set({ selectedNetworks: this.selectedNetworks });
  }

  getCurrentTabStatus() {
    return this.currentTabStatus;
  }

  deleteAuthRequest(requestId: string) {
    delete this.authRequests[requestId];

    this.updateIconAuth(true);
  }

  async authorizeCancel({ id }: RequestAuthorizeCancel): Promise<boolean> {
    const queued = await this.getAuthRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    // Reject without error meaning cancel
    reject(new Error('Cancelled'));

    return true;
  }

  private saveCurrentAuthList() {
    return storage.set({ authUrls: this.authUrls });
  }

  updateDefaultAuthAccounts(defaultAuthAccountSelection: string[]) {
    this.defaultAuthAccountSelection = defaultAuthAccountSelection;

    storage.set({ defaultAuthAccountSelection });
  }

  public getAllAddresses(): string[] {
    return Object.keys(accounts.subject.value);
  }

  public updateNetworkStatus(networkKey: string, status: NETWORK_STATUS) {
    if (this.networkMap[networkKey].networkStatus === status) return;

    this.networkMap[networkKey].networkStatus = status;

    this.networkMapSubject.next(this.networkMap);
    this.networkMapStore.set('NetworkMap', this.networkMap);
  }

  private metaComplete = (
    id: string,
    resolve: (result: boolean) => void,
    reject: (error: Error) => void
  ): Resolver<boolean> => {
    const complete = (): void => {
      delete this.metaRequests[id];

      this.updateIconMeta(true);
    };

    return {
      reject: (error: Error): void => {
        complete();
        reject(error);
      },
      resolve: (result: boolean): void => {
        complete();
        resolve(result);
      },
    };
  };

  private signComplete = (
    id: string,
    resolve: (result: ResponseSigning) => void,
    reject: (error: Error) => void
  ): Resolver<ResponseSigning> => {
    const complete = (): void => {
      delete this.signRequests[id];
      this.updateIconSign(true);
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

  async updateIcon(shouldClose?: boolean): Promise<void> {
    const authCount = this.numAuthRequests();
    const metaCount = this.numMetaRequests();
    const signCount = this.numSignRequests();

    const text = authCount ? 'Auth' : metaCount ? 'Meta' : signCount ? `${signCount}` : '';

    withErrorLog(() => {
      if (chrome.browserAction) chrome.browserAction.setBadgeText({ text });
      else chrome.action.setBadgeText({ text });
    });

    if (shouldClose && text === '') {
      this.popupClose();
    }
  }

  async removeAuthorization(url: string): Promise<AuthUrls> {
    const entry = this.authUrls[url];

    assert(entry, `The source ${url} is not known`);

    delete this.authUrls[url];

    await this.saveCurrentAuthList();

    return this.authUrls;
  }

  updateIconAuth(shouldClose?: boolean): void {
    const allAuthRequests = this.allAuthRequests();

    this.authSubject.next(allAuthRequests);

    this.updateIcon(shouldClose);
  }

  updateIconMeta(shouldClose?: boolean): void {
    const allMetaRequests = this.allMetaRequests();

    this.metaSubject.next(allMetaRequests);
    this.updateIcon(shouldClose);
  }

  updateIconSign(shouldClose?: boolean): void {
    const allSignRequests = this.allSignRequests();

    this.signSubject.next(allSignRequests);
    this.updateIcon(shouldClose);
  }

  updateAuthorizedAccounts(authorizedAccountDiff: AuthorizedAccountsDiff): Promise<void> {
    authorizedAccountDiff.forEach(([url, authorizedAccountDiff]) => {
      this.authUrls[url].authorizedAccounts = authorizedAccountDiff;
    });

    return this.saveCurrentAuthList();
  }

  async authorizeUrl(url: string, request: RequestAuthorizeTab): Promise<AuthResponse> {
    const idStr = stripUrl(url);

    // Do not enqueue duplicate authorization requests.
    const isDuplicate = Object.values(this.authRequests).some((request) => request.idStr === idStr);

    assert(!isDuplicate, `The source ${url} has a pending authorization request`);

    if (this.authUrls[idStr]) {
      // this url was seen in the past
      assert(
        this.authUrls[idStr].authorizedAccounts || this.authUrls[idStr].isAllowed,
        `The source ${url} is not allowed to interact with this extension`
      );

      return {
        authorizedAccounts: [],
        result: false,
      };
    }

    return new Promise((res, rej): void => {
      const id = getId();

      const { reject, resolve } = this.authComplete(id, res, rej);

      this.authRequests[id] = {
        reject,
        resolve,
        id,
        idStr,
        request,
        url,
      };

      this.updateIconAuth();
      this.popupOpen();
    });
  }

  ensureUrlAuthorized(url: string): boolean {
    const stripedUrl = stripUrl(url);
    const entry = this.authUrls[stripedUrl];

    assert(entry, `The source ${url} has not been enabled yet`);

    return true;
  }

  injectMetadata(url: string, request: MetadataDef): Promise<boolean> {
    return new Promise((resolve, reject): void => {
      const id = getId();

      this.metaRequests[id] = {
        ...this.metaComplete(id, resolve, reject),
        id,
        request,
        url,
      };

      this.updateIconMeta();
      this.popupOpen();
    });
  }

  getAuthRequest(id: string): AuthRequest {
    return this.authRequests[id];
  }

  getMetaRequest(id: string): MetaRequest {
    return this.metaRequests[id];
  }

  getSignRequest(id: string): SignRequest {
    return this.signRequests[id];
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

  saveMetadata(meta: MetadataDef): void {
    metaStore.set(meta.genesisHash, meta);

    addMetadata(meta);
  }

  sign(url: string, request: RequestSign, account: AccountJson): Promise<ResponseSigning> {
    const id = getId();

    return new Promise((resolve, reject): void => {
      this.signRequests[id] = {
        ...this.signComplete(id, resolve, reject),
        account,
        id,
        request,
        url,
      };
      this.updateIconSign();
      this.popupOpen();
    });
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

  public getCurrentAccount(update: (value: CurrentAccountState) => void): void {
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
      const currentProvider = network.nodes[0].url;
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

    this.getSubstrateAccounts().forEach(({ address }) => this.generateDefaultBalance(address));
  }

  public async init() {
    await this.eventService.waitCryptoReady;
    await this.prepNetworkJson();
    await this.initNetworkStates();

    this.updateServiceInfo();
  }

  resetApiRetries() {
    Object.values(this.getSubstrateApiMap).forEach((api) => {
      api.nodeIndex = 0;
      api.apiRetry = 0;
    });
  }

  public async initNetworkStates(reset?: boolean) {
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

        if (reset) this.resetApiRetries();

        initApi(network, this);
      }
    });

    if (!reset) this.onReady();
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
    const accountAddress = getSubstrateAddress(address, this);
    const balancesByAddress = this.balanceMap[accountAddress];

    const currencyIndex = balancesByAddress.findIndex(
      ({ assetId: _assetId, symbol: _symbol, relayChain: _relayChain, balances }) => {
        const isExistingGroupAssetId = _assetId === id;
        const isAssetId = balances.some((asset) => asset.id === id);
        const isExistingDisplayName = _symbol === symbol;
        const isExistingAsset = isExistingDisplayName && _relayChain === relayChain;

        return isExistingGroupAssetId || isExistingAsset || isAssetId;
      }
    );

    if (currencyIndex === -1) {
      throw new Error(`Failed to find ${symbol} on ${networkKey}`);
    }

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

  public setCurrentAccount(data: CurrentAccountState, callback: () => void = () => null, updateNetworks = true): void {
    const cb = () => {
      if (updateNetworks) {
        this.setActiveNetworks();

        // logic for Sora library
        if (data?.address && !data.isMobile) {
          const pair = this.keyringService.getPair(data?.address)!;

          apiSora.account = { json: null as any, pair };

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
        .subscribe((xorTotalBalance: FPNumber) => this.updateXorTotalBalance(xorTotalBalance));

      this.subscription.updateSubscription({ name: 'xorTotalBalance', func: subscription.unsubscribe });
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
    const accounts = this.keyringService.getAccounts().filter((el) => !isEthereumAddress(el.address));
    const addresses = this.keyringService.getAddresses();

    return [...accounts, ...addresses];
  }

  public generateDefaultBalance(address: string) {
    if (address === '') return;

    if (this.balanceMap?.[address] === undefined) this.balanceMap[address] = getMockCurrencies(this.networksJson);
  }

  public accountExportPrivateKey({
    address,
    password,
  }: RequestAccountExportPrivateKey): ResponseAccountExportPrivateKey {
    const json = this.keyringService.getPair(address)!.toJson(password);
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

        const totalBalances = Object.keys(balances).map((address) => {
          const total = getSummaryTransferableWalletBalance(
            address,
            balances[address],
            prices,
            ALL_NETWORKS,
            this.networksJson
          );

          const change = getChangeWalletBalance(balances[address], prices, ALL_NETWORKS);

          return {
            address,
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

  getTimespan(name: keyof Timespans, address: string) {
    return this.timespans[name]?.[address] ?? 0;
  }

  saveTimespan(name: keyof Timespans, address: string, value: number) {
    if (!this.timespans[name]) this.timespans[name] = {};

    this.timespans[name]![address] = value;
  }

  async fetchEvmBalance(_networks: NetworkName[] | null) {
    const currentAccount = await this.currentAccount;

    if (!currentAccount || currentAccount?.ethereumAddress === '') return;

    if (Date.now() - this.getTimespan('evmBalances', currentAccount.ethereumAddress) < 1000 * 30) return;

    const networks = Object.values(this.networkMap).filter(({ name, active }) => {
      if (_networks !== null && !_networks.includes(name)) return false;

      if (!active) return false;

      if (!isRequireEvmAPI(name)) return false;

      return true;
    });

    networks.forEach(({ assets, name }) =>
      assets.forEach(({ id }) => fetchEvmAssetBalance(currentAccount.ethereumAddress, name, id, this))
    );

    this.saveTimespan('evmBalances', currentAccount.ethereumAddress, Date.now());
  }
}
