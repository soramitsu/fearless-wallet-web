// Copyright 2019-2022 @polkadot/extension-bg authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { BehaviorSubject, Subject } from 'rxjs';
import { addMetadata, knownMetadata } from '@polkadot/extension-chains';
import { knownGenesis } from '@polkadot/networks/defaults';
import { assert, u8aToHex } from '@polkadot/util';
import { TypeRegistry } from '@polkadot/types';
import { accounts } from '@polkadot/ui-keyring/observable/accounts';
import { base64Decode, isEthereumAddress } from '@polkadot/util-crypto';
import { decodePair } from '@polkadot/keyring/pair/decode';
import { keyring } from '@polkadot/ui-keyring';
import { api as apiSora, FPNumber } from '@sora-substrate/util';

import NetworkMapStore from '@extension-base/stores/NetworkMap';
import MetadataStore from '@extension-base/stores/Metadata';
import { storage } from '@extension-base/stores/Storage';
import EthProvider from '@extension-base/api/evm/ethProvider';
import CustomTokenStore from '@extension-base/stores/CustomEvmToken';
import CurrentAccountStore, { CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import { initEvmTokenState } from '@extension-base/api/evm/utils/eth';
import BalanceService from '@extension-base/shared/balanceService';
import AuthorizeStore from '@extension-base/stores/Authorize';
import { initWeb3Api } from '@extension-base/api/evm';
import PriceStore from '@extension-base/stores/Price';
import { getTokenPrice } from '@extension-base/utils/coingecko';
import { getCurrentProvider, getId } from '@extension-base/utils/utils';
import { initApi } from '@extension-base/api/substrate/api';
import { axios } from '@extension-base/utils/axios';
import { prepNetworkNames } from '@extension-base/const/networks';
import { DEFAULT_EVM_TOKENS } from '@extension-base/api/tokens/evm/defaultEvmToken';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { FWCron } from '@extension-base/background/cron';
import { getMockCurrencies, isEthereumNetwork } from '@extension-base/background/utils/utils';
import { MobileSigningRequest, MobileSignRequest, POPUP_WINDOW_OPTS } from '@extension-base/background/types/types';
import { stripUrl, withErrorLog } from '@extension-base/background/handlers/helpers';
import { FWSubscription, isSubscriptionRunning, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ISubmittableResult, SignerPayloadRaw } from '@polkadot/types/types';
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
} from '@extension-base/background/types/types';
import type { BalanceItem, CustomTokenJson } from '@extension-base/api/evm/types/ether';
import type { ChainRegistry, NetworkJson, TransactionHistoryItemType } from '@extension-base/types';
import type { JsonRpcResponse, ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';
import type { HexString } from '@polkadot/util/types';
import type { SoraFees, XcmLocations, XcmFees, NetworkName } from '@/interfaces';
import { URLS } from '@/consts/urls';
import { ALL_NETWORKS, SORA_NETWORK_NAME, SORA_XOR_ASSET_ID } from '@/consts/networks';
import { getChangeWalletBalance, getSummaryTransferableWalletBalance } from '@/helpers/currencies';

export const cacheRegistryMap: Record<string, ChainRegistry> = {};

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
  evm: Record<NetworkName, EthProvider>;
  substrate: Record<NetworkName, ApiProps>;
};
const metaStore = new MetadataStore();

export default class State {
  public notification = 'popup';
  private cron: FWCron;
  public windows: number[] = [];
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
  private readonly authorizeStore = new AuthorizeStore();
  private readonly priceStore = new PriceStore();
  private readonly evmChainSubject = new Subject<AuthUrls>();
  private readonly authorizeUrlSubject = new Subject<AuthUrls>();
  private readonly currentAccountStore = new CurrentAccountStore();
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
  private historyMap: Record<string, TransactionHistoryItemType[]> = {};
  private historySubject = new Subject<Record<string, TransactionHistoryItemType[]>>();
  public readonly soraCardTokenSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
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

  public get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }

  constructor() {
    this.injectFromStorage();

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

    const { authUrls, defaultAuthAccountSelection, fiatSymbol, injectedProviders, providers, windows } =
      await this.getFromStorage([
        'fiatSymbol',
        'authUrls',
        'defaultAuthAccountSelection',
        'injectedProviders',
        'providers',
        'windows',
      ]);

    if (authUrls && Object.keys(authUrls).length) this.authUrls = authUrls;
    if (windows && windows.length) this.windows = windows;
    if (fiatSymbol) this.setFiatSymbol(fiatSymbol);
    if (injectedProviders) this.injectedProviders = new Map(injectedProviders);
    if (providers) this.providers = providers;
    if (defaultAuthAccountSelection && defaultAuthAccountSelection.length)
      this.defaultAuthAccountSelection = defaultAuthAccountSelection;
  }

  approvePolkaswap = async (authorizedAccounts: string[]): Promise<void> => {
    const { POLKASWAP } = URLS;
    const stripedUrl = stripUrl(POLKASWAP);

    this.authUrls[stripedUrl] = {
      authorizedAccounts,
      count: 0,
      id: getId(),
      origin: 'SubWallet Connect',
      url: POLKASWAP,
      isAllowed: true,
      isAllowedMap: {},
    };

    await this.saveCurrentAuthList();
    await this.updateDefaultAuthAccounts(authorizedAccounts);
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
      await this.updateDefaultAuthAccounts(authorizedAccounts);

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
      url.hostname === 'nhlnehondigmgckngjomcpcefcdplmgc' || url.hostname === '39fb1478-3519-4b4e-8eba-15e6e594494c'
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

  public onInstall() {
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
    const { key, currentProvider, chain, blockExplorer, paraId, nativeToken, decimals } = data;

    if (key in this.networkMap) {
      const network = this.networkMap[key];
      //make network active if it was disabled previously
      network.active = true;
      // update provider for existed network
      network.customNodes = data.customNodes;

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
      this.networkMap[key] = data;
    }

    if (this.networkMap[key].active) {
      // update API map if network is active
      if (data.key in this.apis.substrate) {
        this.apis.substrate[key].api?.disconnect && this.apis.substrate[key].api?.disconnect();
        delete this.apis.substrate[key];
      }

      if (data.isEthereum && key in this.apis.evm) delete this.apis.evm[key];

      const currentProvider = getCurrentProvider(data);

      if (currentProvider) {
        initApi(data);

        if (data.isEthereum && data.isEthereum) {
          this.apis.evm[data.key] = initWeb3Api(currentProvider);
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

    // this.apis.substrate[networkKey].api?.disconnect && (await this.apis.substrate[networkKey].api?.disconnect());

    delete this.apis.substrate[networkKey]; // todo можно и не удалять по идее, значение api для сети будет = undefined

    if (this.networkMap[networkKey].isEthereum && this.networkMap[networkKey].isEthereum)
      delete this.apis.evm[networkKey]; // todo аналогично

    this.networkMap[networkKey].active = false;
    this.networkMap[networkKey].apiStatus = NETWORK_STATUS.DISCONNECTED;
    this.networkMapSubject.next(this.networkMap);
    this.networkMapStore.set('NetworkMap', this.networkMap);
    this.updateServiceInfo();
    this.lockNetworkMap = false;

    this.getAuthorize((data) => {
      if (this.networkMap[networkKey].isEthereum) {
        this.evmChainSubject.next(data);
      }

      this.authorizeUrlSubject.next(data);
    });

    return true;
  }

  public updateServiceInfo() {
    this.getCurrentAccount((accountInfo) => {
      this.serviceInfoSubject.next({
        networkMap: this.networkMap,
        apiMap: this.apis,
        currentAccountInfo: accountInfo,
      });
    });
  }

  public refreshWeb3Api(key: string) {
    const currentProvider = getCurrentProvider(this.networkMap[key]);

    if (currentProvider) this.apis.evm[key] = initWeb3Api(currentProvider);
  }

  public refreshDotSamaApi(key: string) {
    const network = this.networkMap[key];

    if (network && network.apiStatus && network.apiStatus === NETWORK_STATUS.DISCONNECTED) initApi(network);
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
    if (this.networkMap[networkKey].apiStatus === status) return;

    this.networkMap[networkKey].apiStatus = status;

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

  rpcSend(request: RequestRpcSend, port: Port): Promise<JsonRpcResponse> {
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

  public getAccountAddress(): Promise<string | null | undefined> {
    return new Promise((resolve) => {
      this.getCurrentAccount((account) => {
        if (account) {
          resolve(account.address);
        } else {
          resolve(null);
        }
      });
    });
  }

  public refreshPrice() {
    const assets: string[] = this.assetsMap.filter(({ priceId }) => priceId).map(({ priceId }) => priceId);

    getTokenPrice(Array.from(new Set(assets)), this.fiatSymbol)
      .then((rs) => {
        this.setPrice(rs, () => {
          console.info('Get Token Price From CoinGecko');
        });
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

    this.networksJson.forEach(
      (network) =>
        (result[network.name] = {
          ...network,
          key: network.name,
          isEthereum: isEthereumNetwork(network.name),
          genesisHash: `0x${network.chainId}`,
          chainType: 'substrate',
          active: true,
          customNodes: [],
          currentProvider: network.nodes[0].url,
          providers: network.nodes.reduce<Record<string, string>>((result, { name, url }) => {
            result[name] = url;

            return result;
          }, {}),
        })
    );

    this.networkMapStore.set('NetworkMap', result);
    this.networkMap = result;

    this.generateDefaultBalanceMap();
  }

  public async init() {
    await this.prepNetworkJson();

    this.initNetworkStates();
    this.updateServiceInfo();
  }

  public initNetworkStates() {
    this.networkMapStore.get('NetworkMap', async (storedNetworkMap) => {
      for (const [key, network] of Object.entries(storedNetworkMap)) {
        if (network.active) {
          if ((network.isEthereum && key === 'ethereum') || key === 'ethereum_goerli') {
            this.apis.evm[key] = initWeb3Api(key === 'ethereum' ? 'ethereum' : 'ethereum_goerli');
          } else initApi(network);
        }
      }

      this.initCustomTokenState();
    });
  }

  public initCustomTokenState() {
    this.customTokenStore.get('EvmToken', (storedCustomTokens) => {
      if (!storedCustomTokens) this.customTokenState = DEFAULT_EVM_TOKENS;
      else {
        const processedEvmTokens = initEvmTokenState(storedCustomTokens, this.networkMap);

        this.customTokenState = { ...processedEvmTokens };
      }

      this.customTokenStore.set('EvmToken', this.customTokenState);
      this.customTokenSubject.next(this.customTokenState);
    });

    this.onReady();
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

  public updateXorTotalBalance(muchTotal: FPNumber): void {
    this.getCurrentAccount((account) => {
      if (!account) return;

      const { address } = account;

      const currencyIndex = this.balanceMap[address].findIndex(({ assetId }) => assetId === SORA_XOR_ASSET_ID);

      const token = this.balanceMap[address][currencyIndex];
      const index = token.balances.findIndex(({ name }) => name.toLowerCase() === SORA_NETWORK_NAME);

      this.balanceMap[address][currencyIndex].balances[index].muchTotal = muchTotal.toString();
    });
  }

  public setBalanceItem(networkKey: string, item: Partial<BalanceItem>, address: string) {
    const currencyIndex = this.balanceMap[address].findIndex(({ assetId: _assetId, symbol, relayChain }) => {
      const isExistingAssetId = _assetId === item.id;
      const isExistingDisplayName = symbol === item.symbol;
      const isExistingAsset = isExistingDisplayName && relayChain === item.relayChain;

      return isExistingAssetId || isExistingAsset;
    });

    const token = this.balanceMap[address][currencyIndex];
    const index = token.balances.findIndex((el) => {
      const key = prepNetworkNames[el.name] ?? el.name;

      return key === networkKey;
    });

    const balanceItem = this.balanceMap[address][currencyIndex].balances[index];
    const { reserved, free, frozen, total, transferable, state, locked } = item;

    this.balanceMap[address][currencyIndex].balances[index] = {
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
    const exportedJson = keyring.backupAccount(keyring.getPair(address), password);
    const decoded = decodePair(password, base64Decode(exportedJson.encoded), exportedJson.encoding.type);

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

  public getHistoryMap(): Record<string, TransactionHistoryItemType[]> {
    return this.historyMap;
  }

  public subscribeNetworkMap() {
    return this.networkMapStore.getSubject();
  }

  public get getNetworkMap() {
    return this.networkMap;
  }

  public setHistory(
    address: string,
    network: string,
    item: TransactionHistoryItemType | TransactionHistoryItemType[],
    callback?: (items: TransactionHistoryItemType[]) => void
  ): void {
    let items: TransactionHistoryItemType[];
    const networkInfo = this.getNetworkMap[network];

    if (!networkInfo) {
      return;
    }

    if (item && !Array.isArray(item)) {
      item.origin = 'app';
      items = [item];
    } else {
      items = item;
    }

    items.forEach((item) => {
      item.feeSymbol = networkInfo.nativeToken;

      if (!item.changeSymbol) {
        item.changeSymbol = networkInfo.nativeToken;
      }
    });

    if (items.length) {
      this.getAccountAddress().then((currentAddress) => {
        if (currentAddress === address) {
          const oldItems = this.historyMap[network] || [];

          this.historyMap[network] = this.combineHistories(oldItems, items);
          // this.saveHistoryToStorage(address, network, this.historyMap[network]);
          callback && callback(this.historyMap[network]);

          this.lazyNext('setHistory', () => {
            this.publishHistory();
          });
        } else {
          // this.saveHistoryToStorage(address, network, items);
          callback && callback(this.historyMap[network]);
        }
      });
    }
  }

  public subscribeHistory() {
    return this.historySubject;
  }

  private publishHistory() {
    this.historySubject.next(this.getHistoryMap());
  }

  private combineHistories(
    oldItems: TransactionHistoryItemType[],
    newItems: TransactionHistoryItemType[]
  ): TransactionHistoryItemType[] {
    const newHistories = newItems.filter((item) => !oldItems.some((old) => this.isSameHistory(old, item)));

    return [...oldItems, ...newHistories].filter((his) => his.origin === 'app' || his.eventIdx);
  }

  public isSameHistory(oldItem: TransactionHistoryItemType, newItem: TransactionHistoryItemType): boolean {
    if (oldItem.extrinsicHash === newItem.extrinsicHash && oldItem.action === newItem.action) {
      if (oldItem.origin === 'app') {
        return true;
      } else {
        return !oldItem.eventIdx || !newItem.eventIdx || oldItem.eventIdx === newItem.eventIdx;
      }
    }

    return false;
  }
}
