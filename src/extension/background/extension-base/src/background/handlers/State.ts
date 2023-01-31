// Copyright 2019-2022 @polkadot/extension-bg authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BehaviorSubject, Subject } from 'rxjs';
import { addMetadata, knownMetadata } from '@polkadot/extension-chains';
import { knownGenesis } from '@polkadot/networks/defaults';
import { assert } from '@polkadot/util';
import { TypeRegistry } from '@polkadot/types';
import { accounts } from '@polkadot/ui-keyring/observable/accounts';
import {
  AuthorizeRequest,
  AuthRequest,
  AuthResponse,
  AuthUrls,
  MetadataRequest,
  MetaRequest,
  NORMAL_WINDOW_OPTS,
  POPUP_WINDOW_OPTS,
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
  IState,
  ServiceInfo,
  BalanceJson,
} from '../types';
import { getId } from '../../utils';
import MetadataStore from '../../stores/Metadata';
import { storage } from '../../stores/Storage';
import EthProvider from '../../api/evm/ethProvider';
import {
  APIItemState,
  BalanceChildItem,
  BalanceItem,
  CustomToken,
  CustomTokenJson,
  NetworkJson,
} from '../../api/evm/types/ether';
import CustomTokenStore from '../../stores/CustomEvmToken';

import CurrentAccountStore, { CurrentAccountInfo } from '../../stores/CurrentAccountStore';

import { initEvmTokenState } from '../../api/evm/utils/eth';
import BalanceService from '../../shared/balanceService';
import { ChainRegistry } from '../../api/evm/utils/registery';

import NetworkMapStore from '../../stores/NetworkMap';
import AuthorizeStore from '../../stores/Authorize';
import { PREDEFINED_GENESIS_HASHES, PREDEFINED_NETWORKS } from '../../predefinedNetworks';
import { initWeb3Api } from '../../api/evm';
import { TransactionHistoryItemType } from '../../types';
import { getCurrentProvider, mergeNetworkProviders, stripUrl, withErrorLog } from './helpers';

import { FWSubscription, isSubscriptionRunning, unsubscribe } from './subscriptions';
import type { JsonRpcResponse, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';
import type { HexString } from '@polkadot/util/types';
import { DEFAULT_EVM_TOKENS } from '@/consts/networks';

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
const metaStore = new MetadataStore();

export async function initState() {
  extractMetadata(metaStore);

  await storage.set({
    authUrls: {},
    defaultAuthAccountSelection: [],
    accountSubs: {},
    addresses: {},
    windows: [],
    notification: 'popup',
    providers: {},
    connectedTabsUrl: [],
    cachedUnlocks: {},
    balances: {},
  });
}

export default class State {
  subscription: FWSubscription;
  chainRegistryMap: Record<string, ChainRegistry> = {};
  chainRegistrySubject = new Subject<Record<string, ChainRegistry>>();
  readonly unsubscriptionMap: Record<string, () => void> = {};
  private readonly authorizeStore = new AuthorizeStore();
  private readonly evmChainSubject = new Subject<AuthUrls>();
  private readonly authorizeUrlSubject = new Subject<AuthUrls>();
  public authUrls: AuthUrls = {};
  public static signature: HexString | null = null;
  public defaultAuthAccountSelection: string[] = [];
  public apis: { evm: Record<string, EthProvider> } = {
    evm: {},
  };

  authorizeCached: AuthUrls | undefined = undefined;
  networkMap: Record<string, NetworkJson> = {}; // mapping to networkMapStore, for uses in background
  readonly networkMapStore = new NetworkMapStore(); // persist custom networkMap by user
  networkMapSubject = new Subject<Record<string, NetworkJson>>();
  serviceInfoSubject = new Subject<ServiceInfo>();
  private readonly currentAccountStore = new CurrentAccountStore();
  balanceMap: Record<string, BalanceItem> = this.generateDefaultBalanceMap();
  balanceSubject = new Subject<BalanceJson>();
  customTokenState: CustomTokenJson = { erc20: [] };
  customTokenSubject = new Subject<CustomTokenJson>();
  public customTokenStore = new CustomTokenStore();
  public authRequests: Record<string, AuthRequest> = {};
  public metaRequests: Record<string, MetaRequest> = {};
  public signRequests: Record<string, SignRequest> = {};
  private historyMap: Record<string, TransactionHistoryItemType[]> = {};
  private historySubject = new Subject<Record<string, TransactionHistoryItemType[]>>();
  public readonly authSubject: BehaviorSubject<AuthorizeRequest[]> = new BehaviorSubject<AuthorizeRequest[]>([]);
  public readonly metaSubject: BehaviorSubject<MetadataRequest[]> = new BehaviorSubject<MetadataRequest[]>([]);
  public readonly signSubject: BehaviorSubject<SigningRequest[]> = new BehaviorSubject<SigningRequest[]>([]);
  public balanceService = new BalanceService();
  lazyMap: Record<string, unknown> = {};
  ready = false;

  public get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }

  constructor() {
    this.injectFromStorage();
    this.subscription = new FWSubscription(this);
    this.init();
  }

  public getSubstrateApiMap() {
    //return this.apis.substrate;
  }

  public getEvmApiMap() {
    return this.apis.evm;
  }

  public getSubstrateApi(networkKey: string) {
    // return this.apis.substrate[networkKey];
  }

  public getEvmApi(networkKey: string) {
    return this.apis.evm[networkKey];
  }

  public getApiMap() {
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

  private async numAuthRequests() {
    return Object.keys(this.authRequests).length;
  }

  private async numMetaRequests() {
    return Object.keys(this.metaRequests).length;
  }

  private async numSignRequests() {
    return Object.keys(this.signRequests).length;
  }

  public isReady() {
    return this.ready;
  }

  public async allAuthRequests(): Promise<AuthorizeRequest[]> {
    return Object.values(this.authRequests).map(({ id, request, url }): AuthorizeRequest => ({ id, request, url }));
  }

  public async allMetaRequests(): Promise<MetadataRequest[]> {
    return Object.values(this.metaRequests).map(({ id, request, url }): MetadataRequest => ({ id, request, url }));
  }

  public async allSignRequests(): Promise<SigningRequest[]> {
    return Object.values(this.signRequests).map(
      ({ account, id, request, url }): SigningRequest => ({ account, id, request, url })
    );
  }

  async popupClose(): Promise<void> {
    const { windows } = await this.getFromStorage(['windows']);

    windows?.forEach((id: number) => withErrorLog(() => chrome.windows.remove(id)));

    await storage.set({ windows: [] });
  }

  async popupOpen(): Promise<void> {
    const { notification, windows } = await this.getFromStorage(['notification', 'windows']);
    if (notification && notification !== 'extension')
      chrome.windows.getCurrent((win) => {
        const popupOptions = { ...POPUP_WINDOW_OPTS };

        if (win) {
          popupOptions.left = (win.left || 0) + (win.width || 0) - (POPUP_WINDOW_OPTS.width || 0) - 20;
          popupOptions.top = (win.top || 0) + 75;
        }

        chrome.windows.create(
          notification === 'window' ? NORMAL_WINDOW_OPTS : popupOptions,

          async (window): Promise<void> => {
            if (window) {
              windows.push(window.id || 0);

              await storage.set({ windows });
            }
          }
        );
      });
  }

  async injectFromStorage() {
    const { authUrls, defaultAuthAccountSelection } = await this.getFromStorage([
      'authUrls',
      'defaultAuthAccountSelection',
    ]);
    this.authUrls = authUrls;
    this.defaultAuthAccountSelection = defaultAuthAccountSelection;
  }

  authComplete = (
    id: string,
    resolve: (resValue: AuthResponse) => void,
    reject: (error: Error) => void
  ): Resolver<AuthResponse> => {
    const complete = async (authorizedAccounts: string[] = []) => {
      const {
        id: idStr,
        request: { origin },
        url,
      } = this.authRequests[id];

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
        complete();
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

  async updateCurrentTabsUrl(urls: string[]) {
    const connectedTabs = urls
      .map((url) => {
        let strippedUrl = '';

        // the assert in stripUrl may throw for new tabs with "chrome://newtab/"
        try {
          strippedUrl = stripUrl(url);
        } catch (e) {
          console.error(e);
        }

        // return the stripped url only if this website is known
        return !!strippedUrl && this.authUrls[strippedUrl] ? strippedUrl : undefined;
      })
      .filter((value) => !!value) as string[];

    await storage.set({ connectedTabsUrl: connectedTabs });
  }

  public async upsertNetworkMap(data: NetworkJson): Promise<boolean> {
    const { key, currentProvider, chain, blockExplorer, paraId, nativeToken, decimals } = data;

    if (key in this.networkMap) {
      // update provider for existed network
      if (data.customProviders) this.networkMap[data.key].customProviders = data.customProviders;

      if (currentProvider !== this.networkMap[key].currentProvider && currentProvider) {
        this.networkMap[key].currentProvider = currentProvider;
        this.networkMap[key].currentProviderMode = 'ws';
      }

      this.networkMap[key].chain = chain;

      if (nativeToken) this.networkMap[key].nativeToken = nativeToken;

      if (decimals) this.networkMap[key].decimals = decimals;

      this.networkMap[key].paraId = paraId;
      this.networkMap[key].blockExplorer = blockExplorer;
    } else {
      // insert
      this.networkMap[key] = data;
    }

    if (this.networkMap[key].active) {
      // update API map if network is active
      // if (data.key in this.apiMap.dotSama) {
      // this.apis.substrate[data.key].api?.disconnect && (await this.apiMap.dotSama[data.key].api.disconnect());
      // delete this.apis.dotSama[data.key];
      // }
    }

    this.networkMapSubject.next(this.networkMap);
    this.networkMapStore.set('NetworkMap', this.networkMap);
    this.updateServiceInfo();
    // this.lockNetworkMap = false;

    return true;
  }

  public updateServiceInfo() {
    this.getCurrentAccount((value) => {
      this.serviceInfoSubject.next({
        networkMap: this.networkMap,
        apiMap: this.apis,
        currentAccountInfo: value,
        chainRegistry: this.chainRegistryMap,
      });
    });
  }

  async getConnectedTabsUrl() {
    const { connectedTabsUrl } = await this.getFromStorage(['connectedTabsUrl']);

    return connectedTabsUrl;
  }

  async deleteAuthRequest(requestId: string) {
    delete this.authRequests[requestId];

    this.updateIconAuth(true);
  }

  private async saveCurrentAuthList() {
    await storage.set({ authUrls: this.authUrls });
  }

  private async saveDefaultAuthAccounts() {
    await storage.set({ defaultAuthAccountSelection: this.defaultAuthAccountSelection });
  }

  async updateDefaultAuthAccounts(newList: string[]) {
    this.defaultAuthAccountSelection = newList;

    this.saveDefaultAuthAccounts();
  }

  private metaComplete = (
    id: string,
    resolve: (result: boolean) => void,
    reject: (error: Error) => void
  ): Resolver<boolean> => {
    const complete = async (): Promise<void> => {
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
    const complete = async (): Promise<void> => {
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

  async updateIcon(shouldClose?: boolean): Promise<void> {
    const authCount = await this.numAuthRequests();
    const metaCount = await this.numMetaRequests();
    const signCount = await this.numSignRequests();

    const text = authCount ? 'Auth' : metaCount ? 'Meta' : signCount ? `${signCount}` : '';

    withErrorLog(() => chrome.action.setBadgeText({ text }));

    if (shouldClose && text === '') {
      this.popupClose();
    }
  }

  async removeAuthorization(url: string): Promise<AuthUrls> {
    const entry = this.authUrls[url];

    assert(entry, `The source ${url} is not known`);

    delete this.authUrls[url];

    await storage.set({ authUrls: this.authUrls });

    this.saveCurrentAuthList();

    return this.authUrls;
  }

  async updateIconAuth(shouldClose?: boolean): Promise<void> {
    const allAuthRequests = await this.allAuthRequests();

    this.authSubject.next(allAuthRequests);

    this.updateIcon(shouldClose);
  }

  async updateIconMeta(shouldClose?: boolean): Promise<void> {
    const allMetaRequests = await this.allMetaRequests();

    this.metaSubject.next(allMetaRequests);
    this.updateIcon(shouldClose);
  }

  async updateIconSign(shouldClose?: boolean): Promise<void> {
    const allSignRequests = await this.allSignRequests();

    this.signSubject.next(allSignRequests);
    this.updateIcon(shouldClose);
  }

  async updateAuthorizedAccounts(authorizedAccountDiff: AuthorizedAccountsDiff): Promise<void> {
    authorizedAccountDiff.forEach(([url, authorizedAccountDiff]) => {
      this.authUrls[url].authorizedAccounts = authorizedAccountDiff;
    });

    this.saveCurrentAuthList();
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

  async ensureUrlAuthorized(url: string): Promise<boolean> {
    const stripedUrl = stripUrl(url);
    const entry = this.authUrls[stripedUrl];

    assert(entry, `The source ${url} has not been enabled yet`);

    return true;
  }

  async injectMetadata(url: string, request: MetadataDef): Promise<boolean> {
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

  async getAuthRequest(id: string): Promise<AuthRequest> {
    return this.authRequests[id];
  }

  async getMetaRequest(id: string): Promise<MetaRequest> {
    return this.metaRequests[id];
  }

  async getSignRequest(id: string): Promise<SignRequest> {
    return this.signRequests[id];
  }

  // List all providers the extension is exposing
  async rpcListProviders(): Promise<ResponseRpcListProviders> {
    const { providers } = await this.getFromStorage(['providers']);

    return Promise.resolve(
      Object.keys(providers).reduce((acc, key) => {
        acc[key] = providers[key].meta;

        return acc;
      }, {} as ResponseRpcListProviders)
    );
  }

  async rpcSend(request: RequestRpcSend, port: Port): Promise<JsonRpcResponse> {
    const { injectedProviders } = await this.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribe) before provider is set');

    return provider.send(request.method, request.params);
  }

  // Start a provider, return its meta
  async rpcStartProvider(key: string, port: Port): Promise<ProviderMeta> {
    const { providers, injectedProviders } = await this.getFromStorage(['providers', 'injectedProviders']);

    assert(Object.keys(providers).includes(key), `Provider ${key} is not exposed by extension`);

    if (injectedProviders.get(port)) {
      return Promise.resolve(providers[key].meta);
    }

    // Instantiate the provider
    injectedProviders.set(port, providers[key].start());
    await storage.set({ injectedProviders });

    // Close provider connection when page is closed
    port.onDisconnect.addListener(async (): Promise<void> => {
      const provider = injectedProviders.get(port);

      if (provider) {
        withErrorLog(() => provider.disconnect());
      }

      injectedProviders.delete(port);
      await storage.set({ injectedProviders });
    });

    return Promise.resolve(providers[key].meta);
  }

  async rpcSubscribe(
    { method, params, type }: RequestRpcSubscribe,
    cb: ProviderInterfaceCallback,
    port: Port
  ): Promise<number | string> {
    const { injectedProviders } = await this.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribe) before provider is set');

    return provider.subscribe(type, method, params, cb);
  }

  async rpcSubscribeConnected(_request: null, cb: ProviderInterfaceCallback, port: Port): Promise<void> {
    const { injectedProviders } = await this.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribeConnected) before provider is set');

    cb(null, provider.isConnected); // Immediately send back current isConnected
    provider.on('connected', () => cb(null, true));
    provider.on('disconnected', () => cb(null, false));
  }

  async rpcUnsubscribe(request: RequestRpcUnsubscribe, port: Port): Promise<boolean> {
    const { injectedProviders } = await this.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.unsubscribe) before provider is set');

    return provider.unsubscribe(request.type, request.method, request.subscriptionId);
  }

  async saveMetadata(meta: MetadataDef): Promise<void> {
    metaStore.set(meta.genesisHash, meta);

    addMetadata(meta);
  }

  async setNotification(notification: string): Promise<boolean> {
    storage.set({ notification });

    return true;
  }

  async sign(url: string, request: RequestSign, account: AccountJson): Promise<ResponseSigning> {
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
  public async getDecodedAddresses(address?: string): Promise<string[]> {
    let checkingAddress: string | null | undefined = address;

    if (!address) {
      checkingAddress = await this.getAccountAddress();
    }

    if (!checkingAddress) {
      return [];
    }

    if (checkingAddress === 'ALL') {
      return Object.keys(accounts.subject.value);
    }

    return [checkingAddress];
  }

  public getAccountAddress(): Promise<string | null | undefined> {
    return new Promise((resolve, reject) => {
      this.getCurrentAccount((account) => {
        if (account) {
          resolve(account.address);
        } else {
          resolve(null);
        }
      });
    });
  }

  public async getStoredBalance(address: string): Promise<Record<string, BalanceItem>> {
    const items = await this.balanceMap;

    return items || {};
  }

  public async switchAccount(newAddress: string) {
    await Promise.all([this.resetBalanceMap(newAddress)]);
  }

  private publishBalance(reset?: boolean) {
    this.balanceSubject.next(this.getBalance(reset));
  }

  public async resetBalanceMap(newAddress: string) {
    const defaultData = this.generateDefaultBalanceMap();
    let storedData = await this.getStoredBalance(newAddress);

    storedData = this.removeInactiveNetworkData(storedData);

    const merge = { ...defaultData, ...storedData } as Record<string, BalanceItem>;

    this.balanceMap = merge;
    this.publishBalance(true);
  }

  public getActiveErc20Tokens() {
    const filteredErc20Tokens: CustomToken[] = [];

    this.customTokenState.erc20.forEach((token) => {
      if (!token.isDeleted) {
        filteredErc20Tokens.push(token);
      }
    });

    return filteredErc20Tokens;
  }

  public init() {
    this.initNetworkStates();
    this.updateServiceInfo();
  }

  public initNetworkStates() {
    this.networkMapStore.get('NetworkMap', (storedNetworkMap) => {
      if (!storedNetworkMap) {
        // first time init extension
        this.networkMapStore.set('NetworkMap', PREDEFINED_NETWORKS);
        this.networkMap = PREDEFINED_NETWORKS;
      } else {
        // merge custom providers in stored data with predefined data
        const mergedNetworkMap: Record<string, NetworkJson> = PREDEFINED_NETWORKS;

        for (const [key, storedNetwork] of Object.entries(storedNetworkMap)) {
          if (key in PREDEFINED_NETWORKS) {
            // check change and override custom providers if exist
            if ('customProviders' in storedNetwork) {
              mergedNetworkMap[key].customProviders = storedNetwork.customProviders;
              mergedNetworkMap[key].currentProvider = storedNetwork.currentProvider;
            }

            // if (key !== 'polkadot' && key !== 'kusama') {
            //   mergedNetworkMap[key].active = storedNetwork.active;
            // }

            mergedNetworkMap[key].blockExplorer = storedNetwork.blockExplorer;
            mergedNetworkMap[key].currentProviderMode = (mergedNetworkMap[key].currentProvider || '').startsWith('http')
              ? 'http'
              : 'ws';
          } else {
            if (Object.keys(PREDEFINED_GENESIS_HASHES).includes(storedNetwork.genesisHash)) {
              // merge networks with same genesis hash

              const targetKey = PREDEFINED_GENESIS_HASHES[storedNetwork.genesisHash];

              const { currentProviderMethod, parsedCustomProviders, parsedProviderKey } = mergeNetworkProviders(
                storedNetwork,
                PREDEFINED_NETWORKS[targetKey]
              );

              mergedNetworkMap[targetKey].customProviders = parsedCustomProviders;
              mergedNetworkMap[targetKey].currentProvider = parsedProviderKey;
              mergedNetworkMap[targetKey].active = storedNetwork.active;
              mergedNetworkMap[targetKey].currentProviderMode = currentProviderMethod;
            } else {
              if (key.startsWith('custom')) {
                // in case a predefined network is removed, it will be discarded
                mergedNetworkMap[key] = storedNetwork;
              }
            }
          }
        }

        this.networkMapStore.set('NetworkMap', mergedNetworkMap);
        this.networkMap = mergedNetworkMap; // init networkMap state
      }

      for (const [key, network] of Object.entries(this.networkMap)) {
        const currentProvider = getCurrentProvider(network);

        if (!currentProvider) continue;

        if (network.active) {
          // this.apiMap.dotSama[key] = initApi(key, currentProvider, network.isEthereum);

          if (network.isEthereum && network.isEthereum) {
            this.apis.evm[key] = initWeb3Api(key === 'ethereum' ? 'ethereum' : 'ethereum_goerli');
          }
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

    this.initChainRegistry();
  }

  public setBalanceItem(networkKey: string, item: BalanceItem) {
    const itemData = { timestamp: +new Date(), ...item };
    this.balanceMap[networkKey] = { ...this.balanceMap[networkKey], ...itemData };
    this.updateBalanceStore(networkKey, item);
  }

  public getNetworkGenesisHashByKey(key: string) {
    const network = this.networkMap[key];

    return network && network.genesisHash;
  }

  public getCurrentAccount(update: (value: CurrentAccountInfo) => void): void {
    this.currentAccountStore.get('CurrentAccountInfo', update);
  }

  public setCurrentAccount(data: CurrentAccountInfo, callback?: () => void): void {
    const { address, currentGenesisHash } = data;

    if (address === 'ALL') data.allGenesisHash = currentGenesisHash || undefined;

    this.currentAccountStore.set('CurrentAccountInfo', data, () => {
      this.updateServiceInfo();
      callback && callback();
    });
  }

  private updateBalanceStore(networkKey: string, item: BalanceItem) {
    this.getCurrentAccount((currentAccountInfo) => {
      this.balanceService
        .updateBalanceStore(
          networkKey,
          this.getNetworkGenesisHashByKey(networkKey),
          currentAccountInfo.ethereumAddress as string,
          item
        )
        .catch((e) => console.warn(e));
    });
  }

  public generateDefaultBalanceMap() {
    const balanceMap: Record<string, BalanceItem> = {};

    Object.values(this.networkMap).forEach((networkJson) => {
      if (networkJson.active) {
        balanceMap[networkJson.key] = {
          state: APIItemState.PENDING,
        };
      }
    });

    return balanceMap;
  }

  private removeInactiveNetworkData<T>(data: Record<string, T>) {
    const activeData: Record<string, T> = {};

    Object.entries(data).forEach(([networkKey, items]) => {
      if (this.networkMap[networkKey]?.active) {
        activeData[networkKey] = items;
      }
    });

    return activeData;
  }

  public subscribeBalance() {
    return this.balanceSubject;
  }

  public getBalance(reset?: boolean): BalanceJson {
    const activeData = this.removeInactiveNetworkData(this.balanceMap);

    return { details: activeData, reset } as BalanceJson;
  }

  public getCustomTokenStore(callback: (data: CustomTokenJson) => void) {
    return this.customTokenStore.get('EvmToken', (data) => {
      callback(data);
    });
  }
  private lazyNext = (key: string, callback: () => void) => {
    if (this.lazyMap[key]) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      clearTimeout(this.lazyMap[key]);
    }

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

  public getChainRegistryMap(): Record<string, ChainRegistry> {
    return this.chainRegistryMap;
  }

  public setChainRegistryItem(networkKey: string, registry: ChainRegistry) {
    this.chainRegistryMap[networkKey] = registry;
    this.lazyNext('setChainRegistry', () => {
      this.chainRegistrySubject.next(this.getChainRegistryMap());
    });
  }

  public initChainRegistry() {
    this.chainRegistryMap = cacheRegistryMap; // prevents deleting token registry even when network is disabled
    this.getCustomTokenStore((storedCustomTokens) => {
      // const customTokens = getTokensForChainRegistry(storedCustomTokens);

      this.setChainRegistryItem('polkadot', {
        chainDecimals: [10],
        chainTokens: ['DOT'],
        tokenMap: {
          DOT: {
            isMainToken: true,
            name: 'DOT',
            symbol: 'DOT',
            decimals: 10,
          },
        },
      });

      this.setChainRegistryItem('kusama', {
        chainDecimals: [12],
        chainTokens: ['KSM'],
        tokenMap: {
          KSM: {
            isMainToken: true,
            name: 'KSM',
            symbol: 'KSM',
            decimals: 12,
          },
        },
      });

      // Object.entries(this.apiMap.dotSama).forEach(([networkKey, { api }]) => {
      //   getRegistry(networkKey, api, customTokens)
      //     .then((rs) => {
      //       this.setChainRegistryItem(networkKey, rs);
      //     })
      //     .catch(this.logger.error);
      // });

      this.onReady();
    });
  }

  private onReady() {
    this.subscription.start();

    this.ready = true;
  }

  public getHistoryMap(): Record<string, TransactionHistoryItemType[]> {
    return this.removeInactiveNetworkData(this.historyMap);
  }

  public getNetworkMap() {
    return this.networkMap;
  }

  public setHistory(
    address: string,
    network: string,
    item: TransactionHistoryItemType | TransactionHistoryItemType[],
    callback?: (items: TransactionHistoryItemType[]) => void
  ): void {
    let items: TransactionHistoryItemType[];
    const networkInfo = this.getNetworkMap()[network];

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
          this.saveHistoryToStorage(address, network, this.historyMap[network]);
          callback && callback(this.historyMap[network]);

          this.lazyNext('setHistory', () => {
            this.publishHistory();
          });
        } else {
          this.saveHistoryToStorage(address, network, items);
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

  public async getStoredHistories(address: string) {
    const { transaction } = await storage.get(['transaction']);

    return transaction[address] || {};
  }

  private async saveHistoryToStorage(address: string, network: string, items: TransactionHistoryItemType[]) {
    const { transaction } = await storage.get(['transaction']);
    const historyByAddress = transaction[address];
    storage.set({
      transaction: {
        [address]: {
          ...historyByAddress,
          [network]: {
            ...items,
          },
        },
      },
    });
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
