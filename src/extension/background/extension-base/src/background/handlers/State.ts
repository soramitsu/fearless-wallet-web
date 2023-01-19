// Copyright 2019-2022 @polkadot/extension-bg authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BehaviorSubject, Subject } from 'rxjs';
import { addMetadata, knownMetadata } from '@polkadot/extension-chains';
import { knownGenesis } from '@polkadot/networks/defaults';
import { assert } from '@polkadot/util';
import { TypeRegistry } from '@polkadot/types';

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
} from '../types';
import { getId } from '../../utils';
import MetadataStore from '../../stores/Metadata';
import { storage } from '../../stores/Storage';
import EthProvider from '../../api/evm/ethProvider';
import { APIItemState, BalanceItem, CustomToken, CustomTokenJson, NetworkJson } from '../../api/evm/types/ether';
import CustomTokenStore from '../../stores/CustomEvmToken';
import { initEvmTokenState } from '../../api/evm/utils/eth';

import BalanceService from '../../shared/balanceService';
import CurrentAccountStore, { CurrentAccountInfo } from '../../stores/CurrentAccountStore';
import { stripUrl, withErrorLog } from './helpers';
import type { JsonRpcResponse, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';
import type { HexString } from '@polkadot/util/types';
import { DEFAULT_EVM_TOKENS } from '@/consts/networks';

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
  static authUrls: AuthUrls = {};
  static signature: HexString | null = null;
  static defaultAuthAccountSelection: string[] = [];
  static apis: { evm: Record<string, EthProvider> } = {
    evm: {},
  };
  private static networkMap: Record<string, NetworkJson> = {}; // mapping to networkMapStore, for uses in background
  private static networkMapSubject = new Subject<Record<string, NetworkJson>>();
  private static readonly currentAccountStore = new CurrentAccountStore();
  static customTokenStore = new CustomTokenStore();
  private static balanceMap: Record<string, BalanceItem> = State.generateDefaultBalanceMap();
  private static balanceSubject = new Subject<BalanceJson>();
  private static customTokenState: CustomTokenJson = { erc20: [] };
  private static customTokenSubject = new Subject<CustomTokenJson>();
  static authRequests: Record<string, AuthRequest> = {};
  static metaRequests: Record<string, MetaRequest> = {};
  static signRequests: Record<string, SignRequest> = {};
  static readonly authSubject: BehaviorSubject<AuthorizeRequest[]> = new BehaviorSubject<AuthorizeRequest[]>([]);
  static readonly metaSubject: BehaviorSubject<MetadataRequest[]> = new BehaviorSubject<MetadataRequest[]>([]);
  static readonly signSubject: BehaviorSubject<SigningRequest[]> = new BehaviorSubject<SigningRequest[]>([]);
  static balanceService = new BalanceService();
  static get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }

  static getFromStorage(key: (keyof IState)[]) {
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

  static async allAuthRequests(): Promise<AuthorizeRequest[]> {
    return Object.values(State.authRequests).map(({ id, request, url }): AuthorizeRequest => ({ id, request, url }));
  }

  static async allMetaRequests(): Promise<MetadataRequest[]> {
    return Object.values(State.metaRequests).map(({ id, request, url }): MetadataRequest => ({ id, request, url }));
  }

  static async allSignRequests(): Promise<SigningRequest[]> {
    return Object.values(State.signRequests).map(
      ({ account, id, request, url }): SigningRequest => ({ account, id, request, url })
    );
  }

  public async authUrls(): Promise<AuthUrls> {
    return State.authUrls;
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
    this.defaultAuthAccountSelection = newList;

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
  public getActiveErc20Tokens() {
    const filteredErc20Tokens: CustomToken[] = [];

    State.customTokenState.erc20.forEach((token) => {
      if (!token.isDeleted) {
        filteredErc20Tokens.push(token);
      }
    });

    return filteredErc20Tokens;
  }
  public initCustomTokenState() {
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

  public static getActiveErc20Tokens() {
    const filteredErc20Tokens: CustomToken[] = [];

    State.customTokenState.erc20.forEach((token) => {
      if (!token.isDeleted) {
        filteredErc20Tokens.push(token);
      }
    });

    return filteredErc20Tokens;
  }

  public setBalanceItem(networkKey: string, item: BalanceItem) {
    // eslint-disable-next-line no-prototype-builtins
    if (typeof item === 'object' && item.hasOwnProperty('children') && item.children === undefined) {
      delete item.children;
    }

    const itemData = { timestamp: +new Date(), ...item };

    State.balanceMap[networkKey] = { ...State.balanceMap[networkKey], ...itemData };
    this.updateBalanceStore(networkKey, item);
  }

  public static getNetworkGenesisHashByKey(key: string) {
    const network = State.networkMap[key];

    return network && network.genesisHash;
  }

  public static getCurrentAccount(update: (value: CurrentAccountInfo) => void): void {
    return State.currentAccountStore.get('CurrentAccountInfo', update);
  }

  private updateBalanceStore(networkKey: string, item: BalanceItem) {
    State.getCurrentAccount((currentAccountInfo) => {
      State.balanceService
        .updateBalanceStore(networkKey, State.getNetworkGenesisHashByKey(networkKey), currentAccountInfo.address, item)
        .catch((e) => console.warn(e));
    });
  }

  public subscribeBalance() {
    return State.balanceSubject;
  }

  public static generateDefaultBalanceMap() {
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
}
