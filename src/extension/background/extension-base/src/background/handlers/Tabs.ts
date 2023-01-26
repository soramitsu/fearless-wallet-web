// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { PHISHING_PAGE_REDIRECT } from '@extension-base/defaults';
import { checkIfDenied } from '@polkadot/phishing';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { assert, isNumber } from '@polkadot/util';

import RequestBytesSign from '@extension-base/background/RequestBytesSign';
import RequestExtrinsicSign from '@extension-base/background/RequestExtrinsicSign';

import { keyring } from '@polkadot/ui-keyring';
import BeaconSignerJSON from '../BeaconSignerJSON';
import { stripUrl, transformAccounts, transformAddresses, withErrorLog } from './helpers';
import State from './State';
import { createSubscription, unsubscribe } from './subscriptions';
import type {
  AccountSub,
  AuthResponse,
  MessageTypes,
  Port,
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

export default class Tabs {
  accountSubs: Record<string, AccountSub>;
  state: State;

  constructor(state: State) {
    this.state = state;
    this.accountSubs = {};
  }

  async filterForAuthorizedAccounts(accounts: InjectedAccount[], url: string): Promise<InjectedAccount[]> {
    const stripedUrl = stripUrl(url);
    const auth = this.state.authUrls[stripedUrl];

    return accounts.filter((allAcc) =>
      auth.authorizedAccounts
        ? // we have a list, use it
          auth.authorizedAccounts.includes(allAcc.address)
        : // if no authorizedAccounts and isAllowed return all - these are old converted urls
          auth.isAllowed
    );
  }

  async authorize(url: string, request: RequestAuthorizeTab): Promise<AuthResponse> {
    return this.state.authorizeUrl(url, request);
  }

  async accountsListAuthorized(url: string, { anyType }: RequestAccountList): Promise<InjectedAccount[]> {
    const transformedAccounts = transformAccounts(accountsObservable.subject.getValue(), anyType);
    const transformedAddresses = transformAddresses(keyring.addresses.subject.getValue());
    const totalAccounts = [...transformedAccounts, ...transformedAddresses];

    return await this.filterForAuthorizedAccounts(totalAccounts, url);
  }

  async accountsSubscribeAuthorized(url: string, id: string, port: Port): Promise<string> {
    const cb = await createSubscription<'pub(accounts.subscribe)'>(id, port);
    this.accountSubs[id] = {
      subscription: accountsObservable.subject.subscribe(async (accounts: SubjectInfo): Promise<void> => {
        const transformedAccounts = transformAccounts(accounts);
        const transformedMobileAccount = transformAddresses(keyring.addresses.subject.value);
        const allAccounts = [...transformedAccounts, ...transformedMobileAccount];
        await chrome.storage.local.set({ transformAccounts: allAccounts });

        const auths = await this.filterForAuthorizedAccounts(allAccounts, url);

        cb(auths);
      }),
      url,
    };

    port.onDisconnect.addListener((): void => {
      this.accountsUnsubscribe(url, { id });
    });

    return id;
  }

  async accountsUnsubscribe(url: string, { id }: RequestAccountUnsubscribe): Promise<boolean> {
    const sub = this.accountSubs[id];

    if (!sub || sub.url !== url) return false;

    delete this.accountSubs[id];

    unsubscribe(id);
    sub.subscription.unsubscribe();

    return true;
  }

  getSigningPair(address: string): KeyringPair {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find keypair');

    return pair;
  }

  bytesSign(url: string, request: SignerPayloadRaw): Promise<ResponseSigning> {
    const address = request.address;
    const pair = this.getSigningPair(address);

    return this.state.sign(url, new RequestBytesSign(request), { address, ...pair.meta });
  }

  extrinsicSign(url: string, request: SignerPayloadJSON): Promise<ResponseSigning> {
    const address = request.address;
    const isMobile = !!keyring.getAddress(address, 'address')?.meta.isMobile;
    let meta;
    if (keyring.getAccount(address)) meta = this.getSigningPair(address).meta;
    else if (isMobile) meta = keyring.getAddress(address, 'address')?.meta;

    if (isMobile) return this.state.sign(url, new BeaconSignerJSON(request), { address, ...meta });

    return this.state.sign(url, new RequestExtrinsicSign(request), { address, ...meta });
  }

  metadataProvide(url: string, request: MetadataDef): Promise<boolean> {
    return this.state.injectMetadata(url, request);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  metadataList(url: string): InjectedMetadataKnown[] {
    return this.state.knownMetadata.map(({ genesisHash, specVersion }) => ({
      genesisHash,
      specVersion,
    }));
  }

  rpcListProviders(): Promise<ResponseRpcListProviders> {
    return this.state.rpcListProviders();
  }

  rpcSend(request: RequestRpcSend, port: Port): Promise<JsonRpcResponse> {
    return this.state.rpcSend(request, port);
  }

  rpcStartProvider(key: string, port: Port): Promise<ProviderMeta> {
    return this.state.rpcStartProvider(key, port);
  }

  async rpcSubscribe(request: RequestRpcSubscribe, id: string, port: Port): Promise<boolean> {
    const innerCb = await createSubscription<'pub(rpc.subscribe)'>(id, port);
    const cb = (_error: Error | null, data: SubscriptionMessageTypes['pub(rpc.subscribe)']): void => innerCb(data);
    const subscriptionId = await this.state.rpcSubscribe(request, cb, port);

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      withErrorLog(() => this.rpcUnsubscribe({ ...request, subscriptionId }, port));
    });

    return true;
  }

  async rpcSubscribeConnected(request: null, id: string, port: Port): Promise<boolean> {
    const innerCb = await createSubscription<'pub(rpc.subscribeConnected)'>(id, port);
    const cb = (_error: Error | null, data: SubscriptionMessageTypes['pub(rpc.subscribeConnected)']): void =>
      innerCb(data);

    this.state.rpcSubscribeConnected(request, cb, port);

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
    });

    return Promise.resolve(true);
  }

  async rpcUnsubscribe(request: RequestRpcUnsubscribe, port: Port): Promise<boolean> {
    return this.state.rpcUnsubscribe(request, port);
  }

  redirectPhishingLanding(phishingWebsite: string): void {
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

  async redirectIfPhishing(url: string): Promise<boolean> {
    const isInDenyList = await checkIfDenied(url);

    if (isInDenyList) {
      this.redirectPhishingLanding(url);

      return true;
    }

    return false;
  }

  async handle<TMessageType extends MessageTypes>(
    id: string,
    type: TMessageType,
    request: RequestTypes[TMessageType],
    url: string,
    port?: Port
  ): Promise<ResponseTypes[keyof ResponseTypes]> {
    if (type === 'pub(phishing.redirectIfDenied)') return this.redirectIfPhishing(url);

    if (type !== 'pub(authorize.tab)') this.state.ensureUrlAuthorized(url);

    switch (type) {
      case 'pub(authorize.tab)':
        return this.authorize(url, request as RequestAuthorizeTab);

      case 'pub(accounts.list)':
        return this.accountsListAuthorized(url, request as RequestAccountList);

      case 'pub(accounts.subscribe)':
        return port && this.accountsSubscribeAuthorized(url, id, port);

      case 'pub(accounts.unsubscribe)':
        return this.accountsUnsubscribe(url, request as RequestAccountUnsubscribe);

      case 'pub(bytes.sign)':
        return this.bytesSign(url, request as SignerPayloadRaw);

      case 'pub(extrinsic.sign)':
        return this.extrinsicSign(url, request as SignerPayloadJSON);

      case 'pub(metadata.list)':
        return this.metadataList(url);

      case 'pub(metadata.provide)':
        return this.metadataProvide(url, request as MetadataDef);

      case 'pub(rpc.listProviders)':
        return this.rpcListProviders();

      case 'pub(rpc.send)':
        return port && this.rpcSend(request as RequestRpcSend, port);

      case 'pub(rpc.startProvider)':
        return port && this.rpcStartProvider(request as string, port);

      case 'pub(rpc.subscribe)':
        return port && this.rpcSubscribe(request as RequestRpcSubscribe, id, port);

      case 'pub(rpc.subscribeConnected)':
        return port && this.rpcSubscribeConnected(request as null, id, port);

      case 'pub(rpc.unsubscribe)':
        return port && this.rpcUnsubscribe(request as RequestRpcUnsubscribe, port);

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
