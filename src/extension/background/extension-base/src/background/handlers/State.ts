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
  IState,
  Port,
  BalanceJson,
  ServiceInfo,
} from '../types';
import { getId } from '../../utils';
import MetadataStore from '../../stores/Metadata';
import { storage } from '../../stores/Storage';
import EthProvider from '../../api/evm/ethProvider';
import { APIItemState, BalanceItem, CustomToken, CustomTokenJson, NetworkJson } from '../../api/evm/types/ether';
import CustomTokenStore from '../../stores/CustomEvmToken';
import { initEvmTokenState } from '../../api/evm/utils/eth';
import BalanceService from '../../shared/balanceService';
import { CurrentAccountInfo } from '../../stores/CurrentAccountStore';
import { ChainRegistry } from '../../api/evm/utils/registery';

import NetworkMapStore from '../../stores/NetworkMap';
import { stripUrl, withErrorLog } from './helpers';

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
  });
}

export default class State {
  static subscription = new FWSubscription();
  static chainRegistryMap: Record<string, ChainRegistry> = {};
  static chainRegistrySubject = new Subject<Record<string, ChainRegistry>>();
  static readonly unsubscriptionMap: Record<string, () => void> = {};
  // private static readonly authorizeStore = new AuthorizeStore();
  public static authUrls: AuthUrls = {};
  public static signature: HexString | null = null;
  public static defaultAuthAccountSelection: string[] = [];
  static apis: { evm: Record<string, EthProvider> } = {
    evm: {},
  };

  static authorizeCached: AuthUrls | undefined = undefined;
  static networkMap: Record<string, NetworkJson> = {}; // mapping to networkMapStore, for uses in background
  static readonly networkMapStore = new NetworkMapStore(); // persist custom networkMap by user
  static networkMapSubject = new Subject<Record<string, NetworkJson>>();
  static serviceInfoSubject = new Subject<ServiceInfo>();
  static currentAccountStore: Record<string, CurrentAccountInfo> = {};
  static balanceMap: Record<string, BalanceItem> = State.generateDefaultBalanceMap();
  static balanceSubject = new Subject<BalanceJson>();
  static customTokenState: CustomTokenJson = { erc20: [] };
  static customTokenSubject = new Subject<CustomTokenJson>();
  public static customTokenStore = new CustomTokenStore();
  public static authRequests: Record<string, AuthRequest> = {};
  public static metaRequests: Record<string, MetaRequest> = {};
  public static signRequests: Record<string, SignRequest> = {};
  public static readonly authSubject: BehaviorSubject<AuthorizeRequest[]> = new BehaviorSubject<AuthorizeRequest[]>([]);
  public static readonly metaSubject: BehaviorSubject<MetadataRequest[]> = new BehaviorSubject<MetadataRequest[]>([]);
  public static readonly signSubject: BehaviorSubject<SigningRequest[]> = new BehaviorSubject<SigningRequest[]>([]);
  public static balanceService = new BalanceService();
  static lazyMap: Record<string, unknown> = {};
  static ready = false;
  public static get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }
  public static getSubstrateApiMap() {
    // return State.apis.substrate;
    return;
  }

  public static getSubstrateApi(networkKey: string) {
    // return State.apis.substrate[networkKey];
  }

  public static getEvmApi(networkKey: string) {
    return State.apis.evm[networkKey];
  }

  public static getApiMap() {
    return State.apis;
  }
  // public static setAuthorize(data: AuthUrls, callback?: () => void): void {
  //   State.authorizeStore.set('authUrls', data, () => {
  //     State.authorizeCached = data;
  //     State.evmChainSubject.next(State.authorizeCached);
  //     State.authorizeUrlSubject.next(State.authorizeCached);
  //     callback && callback();
  //   });
  // }
  public static createUnsubscriptionHandle(id: string, unsubscribe: () => void): void {
    State.unsubscriptionMap[id] = unsubscribe;
  }

  public static cancelSubscription(id: string): boolean {
    if (isSubscriptionRunning(id)) {
      unsubscribe(id);
    }

    if (State.unsubscriptionMap[id]) {
      State.unsubscriptionMap[id]();

      delete State.unsubscriptionMap[id];
    }

    return true;
  }

  public static subscribeServiceInfo() {
    return State.serviceInfoSubject;
  }

  public static getFromStorage(key: (keyof IState)[]) {
    return storage.get(key);
  }

  private static async numAuthRequests() {
    return Object.keys(State.authRequests).length;
  }

  private static async numMetaRequests() {
    return Object.keys(State.metaRequests).length;
  }

  private static async numSignRequests() {
    return Object.keys(State.signRequests).length;
  }

  public static async allAuthRequests(): Promise<AuthorizeRequest[]> {
    return Object.values(State.authRequests).map(({ id, request, url }): AuthorizeRequest => ({ id, request, url }));
  }

  public static async allMetaRequests(): Promise<MetadataRequest[]> {
    return Object.values(State.metaRequests).map(({ id, request, url }): MetadataRequest => ({ id, request, url }));
  }

  public static async allSignRequests(): Promise<SigningRequest[]> {
    return Object.values(State.signRequests).map(
      ({ account, id, request, url }): SigningRequest => ({ account, id, request, url })
    );
  }

  static async popupClose(): Promise<void> {
    const { windows } = await State.getFromStorage(['windows']);

    windows?.forEach((id: number) => withErrorLog(() => chrome.windows.remove(id)));

    await storage.set({ windows: [] });
  }

  static async popupOpen(): Promise<void> {
    const { notification, windows } = await State.getFromStorage(['notification', 'windows']);
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

  static async injectFromStorage() {
    const { authUrls, defaultAuthAccountSelection } = await State.getFromStorage([
      'authUrls',
      'defaultAuthAccountSelection',
    ]);
    State.authUrls = authUrls;
    State.defaultAuthAccountSelection = defaultAuthAccountSelection;
  }

  static authComplete = (
    id: string,
    resolve: (resValue: AuthResponse) => void,
    reject: (error: Error) => void
  ): Resolver<AuthResponse> => {
    const complete = async (authorizedAccounts: string[] = []) => {
      const {
        id: idStr,
        request: { origin },
        url,
      } = State.authRequests[id];

      const stripedUrl = stripUrl(url);

      State.authUrls[stripedUrl] = {
        authorizedAccounts,
        count: 0,
        isAllowed: true,
        isAllowedMap: {},
        id: idStr,
        origin,
        url,
      };

      await State.saveCurrentAuthList();
      await State.updateDefaultAuthAccounts(authorizedAccounts);

      delete State.authRequests[id];

      State.updateIconAuth(true);
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

  public static getAuthorize(update: (value: AuthUrls) => void): void {
    // This action can be use many by DApp interaction => caching it in memory
    if (State.authorizeCached) {
      update(State.authorizeCached);
    } else {
      // State.authorizeStore.get('authUrls', (data) => {
      //   State.authorizeCached = data;
      //   update(State.authorizeCached);
      // });
    }
  }
  static async updateCurrentTabsUrl(urls: string[]) {
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
        return !!strippedUrl && State.authUrls[strippedUrl] ? strippedUrl : undefined;
      })
      .filter((value) => !!value) as string[];

    await storage.set({ connectedTabsUrl: connectedTabs });
  }
  public static async upsertNetworkMap(data: NetworkJson): Promise<boolean> {
    if (data.key in State.networkMap) {
      // update provider for existed network
      if (data.customProviders) {
        State.networkMap[data.key].customProviders = data.customProviders;
      }

      if (data.currentProvider !== State.networkMap[data.key].currentProvider && data.currentProvider) {
        State.networkMap[data.key].currentProvider = data.currentProvider;
        State.networkMap[data.key].currentProviderMode = 'ws';
      }

      State.networkMap[data.key].chain = data.chain;

      if (data.nativeToken) State.networkMap[data.key].nativeToken = data.nativeToken;

      if (data.decimals) State.networkMap[data.key].decimals = data.decimals;

      State.networkMap[data.key].paraId = data.paraId;

      State.networkMap[data.key].blockExplorer = data.blockExplorer;
    } else {
      // insert
      State.networkMap[data.key] = data;
    }

    if (State.networkMap[data.key].active) {
      // update API map if network is active
      // if (data.key in this.apiMap.dotSama) {
      // State.apis.substrate[data.key].api?.disconnect && (await this.apiMap.dotSama[data.key].api.disconnect());
      // delete State.apis.dotSama[data.key];
      // }

      State.apis.evm['homestead'] = new EthProvider('homestead');
      State.apis.evm['goerli'] = new EthProvider('goerli');
    }

    State.networkMapSubject.next(State.networkMap);
    State.networkMapStore.set('NetworkMap', State.networkMap);
    State.updateServiceInfo();
    // this.lockNetworkMap = false;

    return true;
  }
  public static updateServiceInfo() {
    const account = State.getCurrentAccount();

    State.serviceInfoSubject.next({
      networkMap: State.networkMap,
      apiMap: State.apis,
      currentAccountInfo: account,
      chainRegistry: State.chainRegistryMap,
    });
  }

  static async getConnectedTabsUrl() {
    const { connectedTabsUrl } = await State.getFromStorage(['connectedTabsUrl']);

    return connectedTabsUrl;
  }

  static async deleteAuthRequest(requestId: string) {
    delete State.authRequests[requestId];

    State.updateIconAuth(true);
  }

  private static async saveCurrentAuthList() {
    await storage.set({ authUrls: State.authUrls });
  }

  private static async saveDefaultAuthAccounts() {
    await storage.set({ defaultAuthAccountSelection: State.defaultAuthAccountSelection });
  }

  static async updateDefaultAuthAccounts(newList: string[]) {
    State.defaultAuthAccountSelection = newList;

    State.saveDefaultAuthAccounts();
  }

  private static metaComplete = (
    id: string,
    resolve: (result: boolean) => void,
    reject: (error: Error) => void
  ): Resolver<boolean> => {
    const complete = async (): Promise<void> => {
      delete State.metaRequests[id];

      State.updateIconMeta(true);
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

  private static signComplete = (
    id: string,
    resolve: (result: ResponseSigning) => void,
    reject: (error: Error) => void
  ): Resolver<ResponseSigning> => {
    const complete = async (): Promise<void> => {
      delete State.signRequests[id];
      State.updateIconSign(true);
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

  static async updateIcon(shouldClose?: boolean): Promise<void> {
    const authCount = await State.numAuthRequests();
    const metaCount = await State.numMetaRequests();
    const signCount = await State.numSignRequests();

    const text = authCount ? 'Auth' : metaCount ? 'Meta' : signCount ? `${signCount}` : '';

    withErrorLog(() => chrome.action.setBadgeText({ text }));

    if (shouldClose && text === '') {
      this.popupClose();
    }
  }

  static async removeAuthorization(url: string): Promise<AuthUrls> {
    const entry = State.authUrls[url];

    assert(entry, `The source ${url} is not known`);

    delete State.authUrls[url];

    await storage.set({ authUrls: State.authUrls });

    State.saveCurrentAuthList();

    return State.authUrls;
  }

  static async updateIconAuth(shouldClose?: boolean): Promise<void> {
    const allAuthRequests = await State.allAuthRequests();

    State.authSubject.next(allAuthRequests);

    State.updateIcon(shouldClose);
  }

  static async updateIconMeta(shouldClose?: boolean): Promise<void> {
    const allMetaRequests = await State.allMetaRequests();

    State.metaSubject.next(allMetaRequests);
    State.updateIcon(shouldClose);
  }

  static async updateIconSign(shouldClose?: boolean): Promise<void> {
    const allSignRequests = await State.allSignRequests();

    State.signSubject.next(allSignRequests);
    State.updateIcon(shouldClose);
  }

  static async updateAuthorizedAccounts(authorizedAccountDiff: AuthorizedAccountsDiff): Promise<void> {
    authorizedAccountDiff.forEach(([url, authorizedAccountDiff]) => {
      State.authUrls[url].authorizedAccounts = authorizedAccountDiff;
    });

    State.saveCurrentAuthList();
  }

  static async authorizeUrl(url: string, request: RequestAuthorizeTab): Promise<AuthResponse> {
    const idStr = stripUrl(url);

    // Do not enqueue duplicate authorization requests.
    const isDuplicate = Object.values(State.authRequests).some((request) => request.idStr === idStr);

    assert(!isDuplicate, `The source ${url} has a pending authorization request`);

    if (State.authUrls[idStr]) {
      // this url was seen in the past
      assert(
        State.authUrls[idStr].authorizedAccounts || State.authUrls[idStr].isAllowed,
        `The source ${url} is not allowed to interact with this extension`
      );

      return {
        authorizedAccounts: [],
        result: false,
      };
    }

    return new Promise((res, rej): void => {
      const id = getId();

      const { reject, resolve } = State.authComplete(id, res, rej);

      State.authRequests[id] = {
        reject,
        resolve,
        id,
        idStr,
        request,
        url,
      };

      State.updateIconAuth();
      State.popupOpen();
    });
  }

  static async ensureUrlAuthorized(url: string): Promise<boolean> {
    const stripedUrl = stripUrl(url);
    const entry = State.authUrls[stripedUrl];

    assert(entry, `The source ${url} has not been enabled yet`);

    return true;
  }

  static async injectMetadata(url: string, request: MetadataDef): Promise<boolean> {
    return new Promise((resolve, reject): void => {
      const id = getId();

      State.metaRequests[id] = {
        ...State.metaComplete(id, resolve, reject),
        id,
        request,
        url,
      };

      State.updateIconMeta();
      State.popupOpen();
    });
  }

  static async getAuthRequest(id: string): Promise<AuthRequest> {
    return State.authRequests[id];
  }

  static async getMetaRequest(id: string): Promise<MetaRequest> {
    return State.metaRequests[id];
  }

  static async getSignRequest(id: string): Promise<SignRequest> {
    return State.signRequests[id];
  }

  // List all providers the extension is exposing
  static async rpcListProviders(): Promise<ResponseRpcListProviders> {
    const { providers } = await State.getFromStorage(['providers']);

    return Promise.resolve(
      Object.keys(providers).reduce((acc, key) => {
        acc[key] = providers[key].meta;

        return acc;
      }, {} as ResponseRpcListProviders)
    );
  }

  static async rpcSend(request: RequestRpcSend, port: Port): Promise<JsonRpcResponse> {
    const { injectedProviders } = await State.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribe) before provider is set');

    return provider.send(request.method, request.params);
  }

  // Start a provider, return its meta
  static async rpcStartProvider(key: string, port: Port): Promise<ProviderMeta> {
    const { providers, injectedProviders } = await State.getFromStorage(['providers', 'injectedProviders']);

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

  static async rpcSubscribe(
    { method, params, type }: RequestRpcSubscribe,
    cb: ProviderInterfaceCallback,
    port: Port
  ): Promise<number | string> {
    const { injectedProviders } = await State.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribe) before provider is set');

    return provider.subscribe(type, method, params, cb);
  }

  static async rpcSubscribeConnected(_request: null, cb: ProviderInterfaceCallback, port: Port): Promise<void> {
    const { injectedProviders } = await State.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribeConnected) before provider is set');

    cb(null, provider.isConnected); // Immediately send back current isConnected
    provider.on('connected', () => cb(null, true));
    provider.on('disconnected', () => cb(null, false));
  }

  static async rpcUnsubscribe(request: RequestRpcUnsubscribe, port: Port): Promise<boolean> {
    const { injectedProviders } = await State.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.unsubscribe) before provider is set');

    return provider.unsubscribe(request.type, request.method, request.subscriptionId);
  }

  static async saveMetadata(meta: MetadataDef): Promise<void> {
    metaStore.set(meta.genesisHash, meta);

    addMetadata(meta);
  }

  static async setNotification(notification: string): Promise<boolean> {
    storage.set({ notification });

    return true;
  }

  static async sign(url: string, request: RequestSign, account: AccountJson): Promise<ResponseSigning> {
    const id = getId();

    return new Promise((resolve, reject): void => {
      State.signRequests[id] = {
        ...State.signComplete(id, resolve, reject),
        account,
        id,
        request,
        url,
      };
      State.updateIconSign();
      State.popupOpen();
    });
  }
  public static async getDecodedAddresses(address?: string): Promise<string[]> {
    let checkingAddress: string | null | undefined = address;

    if (!address) {
      checkingAddress = await State.getAccountAddress();
    }

    if (!checkingAddress) {
      return [];
    }

    if (checkingAddress === 'ALL') {
      return Object.keys(accounts.subject.value);
    }

    return [checkingAddress];
  }

  public static getAccountAddress(): Promise<string | null | undefined> {
    return new Promise((resolve, reject) => {
      const account = State.getCurrentAccount();

      if (account) {
        resolve(account.address);
      } else {
        resolve(null);
      }
    });
  }

  public static async getStoredBalance(address: string): Promise<Record<string, BalanceItem>> {
    const items = await State.balanceMap;

    return items || {};
  }

  public static async switchAccount(newAddress: string) {
    await Promise.all([State.resetBalanceMap(newAddress)]);
  }

  private static publishBalance(reset?: boolean) {
    State.balanceSubject.next(State.getBalance(reset));
  }

  public static async resetBalanceMap(newAddress: string) {
    const defaultData = State.generateDefaultBalanceMap();
    let storedData = await State.getStoredBalance(newAddress);

    storedData = State.removeInactiveNetworkData(storedData);

    const merge = { ...defaultData, ...storedData } as Record<string, BalanceItem>;

    State.balanceMap = merge;
    State.publishBalance(true);
  }

  public static getActiveErc20Tokens() {
    const filteredErc20Tokens: CustomToken[] = [];

    State.customTokenState.erc20.forEach((token) => {
      if (!token.isDeleted) {
        filteredErc20Tokens.push(token);
      }
    });

    return filteredErc20Tokens;
  }

  public static initCustomTokenState() {
    State.customTokenStore.get('EvmToken', (storedCustomTokens) => {
      if (!storedCustomTokens) {
        State.customTokenState = DEFAULT_EVM_TOKENS;
      } else {
        const processedEvmTokens = initEvmTokenState(storedCustomTokens, State.networkMap);

        State.customTokenState = { ...processedEvmTokens };
      }

      State.customTokenStore.set('EvmToken', State.customTokenState);
      State.customTokenSubject.next(State.customTokenState);
    });
  }

  public static setBalanceItem(networkKey: string, item: BalanceItem) {
    // eslint-disable-next-line no-prototype-builtins
    if (typeof item === 'object' && item.hasOwnProperty('children') && item.children === undefined) {
      delete item.children;
    }

    const itemData = { timestamp: +new Date(), ...item };

    State.balanceMap[networkKey] = { ...State.balanceMap[networkKey], ...itemData };
    State.updateBalanceStore(networkKey, item);
  }

  public static getNetworkGenesisHashByKey(key: string) {
    const network = State.networkMap[key];

    return network && network.genesisHash;
  }

  public static getCurrentAccount() {
    return {
      address: '14aR963sW6gNo6breubdqbQHdd7HT1K75YQp3Pk9qWFdtnbF',
      ethereumAddress: '0x599dC6fD485E0eD55C1BCc7D8AE02EDAF7bE4f4e',
      currentGenesisHash: '',
    };
  }

  public static setCurrentAccount(data: CurrentAccountInfo, callback?: () => void): void {
    const { address, currentGenesisHash } = data;

    if (address === 'ALL') {
      data.allGenesisHash = currentGenesisHash || undefined;
    }

    State.currentAccountStore = {
      [address]: data,
    };
    State.updateServiceInfo();
    callback && callback();
  }

  private static updateBalanceStore(networkKey: string, item: BalanceItem) {
    const account = State.getCurrentAccount();
    State.balanceService
      .updateBalanceStore(networkKey, State.getNetworkGenesisHashByKey(networkKey), account.address, item)
      .catch((e) => console.warn(e));
  }

  public static generateDefaultBalanceMap() {
    const balanceMap: Record<string, BalanceItem> = {};

    Object.values(State.networkMap).forEach((networkJson) => {
      if (networkJson.active) {
        balanceMap[networkJson.key] = {
          state: APIItemState.PENDING,
        };
      }
    });

    return balanceMap;
  }

  private static removeInactiveNetworkData<T>(data: Record<string, T>) {
    const activeData: Record<string, T> = {};

    Object.entries(data).forEach(([networkKey, items]) => {
      if (State.networkMap[networkKey]?.active) {
        activeData[networkKey] = items;
      }
    });

    return activeData;
  }

  public static subscribeBalance() {
    return State.balanceSubject;
  }

  public static getBalance(reset?: boolean): BalanceJson {
    const activeData = State.removeInactiveNetworkData(State.balanceMap);

    return { details: activeData, reset } as BalanceJson;
  }

  public static getCustomTokenStore(callback: (data: CustomTokenJson) => void) {
    return State.customTokenStore.get('EvmToken', (data) => {
      callback(data);
    });
  }
  private static lazyNext = (key: string, callback: () => void) => {
    if (this.lazyMap[key]) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      clearTimeout(State.lazyMap[key]);
    }

    const lazy = setTimeout(() => {
      callback();
      clearTimeout(lazy);
    }, 300);

    State.lazyMap[key] = lazy;
  };

  public static getAddressList(value = false): Record<string, boolean> {
    const addressList = Object.keys(accounts.subject.value);

    return addressList.reduce((addressList, v) => ({ ...addressList, [v]: value }), {});
  }

  public static getChainRegistryMap(): Record<string, ChainRegistry> {
    return State.chainRegistryMap;
  }

  public static setChainRegistryItem(networkKey: string, registry: ChainRegistry) {
    State.chainRegistryMap[networkKey] = registry;
    State.lazyNext('setChainRegistry', () => {
      State.chainRegistrySubject.next(State.getChainRegistryMap());
    });
  }

  public static initChainRegistry() {
    State.chainRegistryMap = cacheRegistryMap; // prevents deleting token registry even when network is disabled
    State.getCustomTokenStore((storedCustomTokens) => {
      // const customTokens = getTokensForChainRegistry(storedCustomTokens);

      State.setChainRegistryItem('polkadot', {
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

      State.setChainRegistryItem('kusama', {
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

      State.onReady();
    });
  }

  private static onReady() {
    State.subscription.start();

    State.ready = true;
  }
}
