// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { PHISHING_PAGE_REDIRECT } from '@extension-base/defaults';
import { checkIfDenied } from '@polkadot/phishing';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { assert, isNumber } from '@polkadot/util';

import RequestBytesSign from '../RequestBytesSign';
import RequestExtrinsicSign from '../RequestExtrinsicSign';
import { stripUrl, transformAccounts, transformAddresses, withErrorLog } from './helpers';
import State from './State';
import { createSubscription, unsubscribe } from './subscriptions';
import type {
  AccountSub,
  AuthResponse,
  MessageTypes,
  RequestAccountList,
  RequestAccountUnsubscribe,
  RequestAuthorizeTab,
  RequestRpcSend,
  RequestRpcSubscribe,
  RequestRpcUnsubscribe,
  RequestTypes,
  ResponseRpcListProviders,
  ResponseSigning,
  ResponseTypes,
  SubscriptionMessageTypes,
} from '../types';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { JsonRpcResponse } from '@polkadot/rpc-provider/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import type {
  InjectedAccount,
  InjectedMetadataKnown,
  MetadataDef,
  ProviderMeta,
} from '@polkadot/extension-inject/types';
import { keyring } from '@/controllers/keyringChrome';

export default class Tabs {
  static accountSubs: Record<string, AccountSub> = {};

  static async filterForAuthorizedAccounts(accounts: InjectedAccount[], url: string): Promise<InjectedAccount[]> {
    const stripedUrl = stripUrl(url);
    const auth = State.authUrls[stripedUrl];

    return accounts.filter((allAcc) =>
      auth.authorizedAccounts
        ? // we have a list, use it
          auth.authorizedAccounts.includes(allAcc.address)
        : // if no authorizedAccounts and isAllowed return all - these are old converted urls
          auth.isAllowed
    );
  }

  static async authorize(url: string, request: RequestAuthorizeTab): Promise<AuthResponse> {
    return State.authorizeUrl(url, request);
  }

  static async accountsListAuthorized(url: string, { anyType }: RequestAccountList): Promise<InjectedAccount[]> {
    const transformedAccounts = transformAccounts(accountsObservable.subject.getValue(), anyType);
    const transformedAddresses = transformAddresses(keyring.addresses.subject.getValue());
    const totalAccounts = [...transformedAccounts, ...transformedAddresses];

    return await Tabs.filterForAuthorizedAccounts(totalAccounts, url);
  }

  static async accountsSubscribeAuthorized(url: string, id: string, port: chrome.runtime.Port): Promise<string> {
    const cb = await createSubscription<'pub(accounts.subscribe)'>(id, port);
    Tabs.accountSubs[id] = {
      subscription: accountsObservable.subject.subscribe(async (accounts: SubjectInfo): Promise<void> => {
        const transformedAccounts = transformAccounts(accounts);
        chrome.storage.local.set({ transformAccounts });
        const auths = await Tabs.filterForAuthorizedAccounts(transformedAccounts, url);
        cb(auths);
      }),
      url,
    };

    port.onDisconnect.addListener((): void => {
      Tabs.accountsUnsubscribe(url, { id });
    });

    return id;
  }

  static async accountsUnsubscribe(url: string, { id }: RequestAccountUnsubscribe): Promise<boolean> {
    const sub = Tabs.accountSubs[id];

    if (!sub || sub.url !== url) return false;

    delete Tabs.accountSubs[id];

    unsubscribe(id);
    sub.subscription.unsubscribe();

    return true;
  }

  static getSigningPair(address: string): KeyringPair {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find keypair');

    return pair;
  }

  static bytesSign(url: string, request: SignerPayloadRaw): Promise<ResponseSigning> {
    const address = request.address;
    const pair = Tabs.getSigningPair(address);

    return State.sign(url, new RequestBytesSign(request), { address, ...pair.meta });
  }

  static extrinsicSign(url: string, request: SignerPayloadJSON): Promise<ResponseSigning> {
    const address = request.address;
    let meta;

    if (keyring.getAccount(address)) meta = Tabs.getSigningPair(address).meta;
    else if (keyring.getAddress(address, 'address')) meta = keyring.getAddress(address, 'address')?.meta;

    return State.sign(url, new RequestExtrinsicSign(request), { address, ...meta });
  }

  static metadataProvide(url: string, request: MetadataDef): Promise<boolean> {
    return State.injectMetadata(url, request);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static metadataList(url: string): InjectedMetadataKnown[] {
    return State.knownMetadata.map(({ genesisHash, specVersion }) => ({
      genesisHash,
      specVersion,
    }));
  }

  static rpcListProviders(): Promise<ResponseRpcListProviders> {
    return State.rpcListProviders();
  }

  static rpcSend(request: RequestRpcSend, port: chrome.runtime.Port): Promise<JsonRpcResponse> {
    return State.rpcSend(request, port);
  }

  static rpcStartProvider(key: string, port: chrome.runtime.Port): Promise<ProviderMeta> {
    return State.rpcStartProvider(key, port);
  }

  static async rpcSubscribe(request: RequestRpcSubscribe, id: string, port: chrome.runtime.Port): Promise<boolean> {
    const innerCb = await createSubscription<'pub(rpc.subscribe)'>(id, port);
    const cb = (_error: Error | null, data: SubscriptionMessageTypes['pub(rpc.subscribe)']): void => innerCb(data);
    const subscriptionId = await State.rpcSubscribe(request, cb, port);

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      withErrorLog(() => Tabs.rpcUnsubscribe({ ...request, subscriptionId }, port));
    });

    return true;
  }

  static async rpcSubscribeConnected(request: null, id: string, port: chrome.runtime.Port): Promise<boolean> {
    const innerCb = await createSubscription<'pub(rpc.subscribeConnected)'>(id, port);
    const cb = (_error: Error | null, data: SubscriptionMessageTypes['pub(rpc.subscribeConnected)']): void =>
      innerCb(data);

    State.rpcSubscribeConnected(request, cb, port);

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
    });

    return Promise.resolve(true);
  }

  static async rpcUnsubscribe(request: RequestRpcUnsubscribe, port: chrome.runtime.Port): Promise<boolean> {
    return State.rpcUnsubscribe(request, port);
  }

  static redirectPhishingLanding(phishingWebsite: string): void {
    const nonFragment = phishingWebsite.split('#')[0];
    const encodedWebsite = encodeURIComponent(nonFragment);
    const url = `${chrome.runtime.getURL('index.html')}#${PHISHING_PAGE_REDIRECT}/${encodedWebsite}`;

    chrome.tabs.query({ url: nonFragment }, (tabs) => {
      tabs
        .map(({ id }) => id)
        .filter((id): id is number => isNumber(id))
        .forEach((id) => withErrorLog(() => chrome.tabs.update(id, { url })));
    });
  }

  static async redirectIfPhishing(url: string): Promise<boolean> {
    const isInDenyList = await checkIfDenied(url);

    if (isInDenyList) {
      Tabs.redirectPhishingLanding(url);

      return true;
    }

    return false;
  }

  static async handle<TMessageType extends MessageTypes>(
    id: string,
    type: TMessageType,
    request: RequestTypes[TMessageType],
    url: string,
    port?: chrome.runtime.Port
  ): Promise<ResponseTypes[keyof ResponseTypes]> {
    if (type === 'pub(phishing.redirectIfDenied)') return Tabs.redirectIfPhishing(url);

    if (type !== 'pub(authorize.tab)') State.ensureUrlAuthorized(url);

    switch (type) {
      case 'pub(authorize.tab)':
        return Tabs.authorize(url, request as RequestAuthorizeTab);

      case 'pub(accounts.list)':
        return Tabs.accountsListAuthorized(url, request as RequestAccountList);

      case 'pub(accounts.subscribe)':
        return port && Tabs.accountsSubscribeAuthorized(url, id, port);

      case 'pub(accounts.unsubscribe)':
        return Tabs.accountsUnsubscribe(url, request as RequestAccountUnsubscribe);

      case 'pub(bytes.sign)':
        return Tabs.bytesSign(url, request as SignerPayloadRaw);

      case 'pub(extrinsic.sign)':
        return Tabs.extrinsicSign(url, request as SignerPayloadJSON);

      case 'pub(metadata.list)':
        return Tabs.metadataList(url);

      case 'pub(metadata.provide)':
        return Tabs.metadataProvide(url, request as MetadataDef);

      case 'pub(rpc.listProviders)':
        return Tabs.rpcListProviders();

      case 'pub(rpc.send)':
        return port && Tabs.rpcSend(request as RequestRpcSend, port);

      case 'pub(rpc.startProvider)':
        return port && Tabs.rpcStartProvider(request as string, port);

      case 'pub(rpc.subscribe)':
        return port && Tabs.rpcSubscribe(request as RequestRpcSubscribe, id, port);

      case 'pub(rpc.subscribeConnected)':
        return port && Tabs.rpcSubscribeConnected(request as null, id, port);

      case 'pub(rpc.unsubscribe)':
        return port && Tabs.rpcUnsubscribe(request as RequestRpcUnsubscribe, port);

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
