// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { PHISHING_PAGE_REDIRECT } from '@extension-base/defaults';
import { checkIfDenied } from '@polkadot/phishing';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { addresses as addressesObservable } from '@polkadot/ui-keyring/observable/addresses';

import { assert, isNumber } from '@polkadot/util';
import { keyring } from '@polkadot/ui-keyring';
import {
  stripUrl,
  transformAccounts,
  transformAddresses,
  withErrorLog,
} from '@extension-base/background/handlers/helpers';
import State from '@extension-base/background/handlers/State';
import { createSubscription, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import BeaconSignerJSON from '@extension-base/signers/BeaconSignerJSON';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import type {
  AccountSub,
  AuthUrlInfo,
  AuthUrls,
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
} from '@extension-base/background/types/types';
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
    const entries = await this.state.requestService.getAuthList();

    const auth = entries[stripedUrl];

    return accounts.filter((allAcc) =>
      auth.authorizedAccounts
        ? // we have a list, use it
          auth.authorizedAccounts.includes(allAcc.address)
        : // if no authorizedAccounts and isAllowed return all - these are old converted urls
          auth.isAllowed
    );
  }

  authorize(url: string, request: RequestAuthorizeTab): Promise<boolean> {
    return this.state.requestService.authorizeUrl(url, request);
  }

  async accountsListAuthorized(url: string, { anyType }: RequestAccountList): Promise<InjectedAccount[]> {
    const transformedAccounts = transformAccounts(accountsObservable.subject.getValue(), anyType);
    const transformedAddresses = transformAddresses(addressesObservable.subject.getValue());
    const totalAccounts = [...transformedAccounts, ...transformedAddresses];

    const filteredAuths = await this.filterForAuthorizedAccounts(totalAccounts, url);

    return filteredAuths;
  }

  async getAuthInfo(url: string, fromList?: AuthUrls): Promise<AuthUrlInfo | undefined> {
    const auths = await this.state.requestService.getAuthList();
    const authList = fromList || auths;
    const shortenUrl = stripUrl(url);

    return authList[shortenUrl];
  }

  async accountsSubscribeAuthorized(url: string, id: string, port: Port): Promise<string> {
    const cb = createSubscription<'pub(accounts.subscribe)'>(id, port);
    this.accountSubs[id] = {
      subscription: accountsObservable.subject.subscribe(async (accounts: SubjectInfo): Promise<void> => {
        const transformedAccounts = transformAccounts(accounts);
        const transformedMobileAccount = transformAddresses(addressesObservable.subject.getValue());
        const allAccounts = [...transformedAccounts, ...transformedMobileAccount];

        chrome.storage.local.set({ transformAccounts: allAccounts });

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

  accountsUnsubscribe(url: string, { id }: RequestAccountUnsubscribe): boolean {
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

    return this.state.requestService.substrateRequestHandler.sign(url, new RequestBytesSign(request), {
      address: pair.address,
      ethereumAddress: pair.meta.ethereumAddress as string,
      name: (pair.meta.name as string) ?? '',
      ...pair.meta,
    });
  }

  extrinsicSign(url: string, request: SignerPayloadJSON): Promise<ResponseSigning> {
    const address = keyring.encodeAddress(request.address);
    const isMobile = !!keyring.getAddress(address, 'address')?.meta.isMobile;
    let meta;

    if (keyring.getAccount(address)) meta = this.getSigningPair(address).meta;
    else if (isMobile) meta = keyring.getAddress(address, 'address')?.meta;

    const signer = isMobile ? new BeaconSignerJSON(request) : new RequestExtrinsicSign(request);

    return this.state.requestService.substrateRequestHandler.sign(url, signer, {
      address: address,
      ethereumAddress: meta?.ethereumAddress as string,
      name: (meta?.name as string) ?? '',
      ...meta,
    });
  }

  metadataProvide(url: string, request: MetadataDef): Promise<boolean> {
    return this.state.requestService.injectMetadata(url, request);
  }

  metadataList(): InjectedMetadataKnown[] {
    return this.state.knownMetadata.map(({ genesisHash, specVersion }) => ({
      genesisHash,
      specVersion,
    }));
  }

  rpcListProviders(): ResponseRpcListProviders {
    return this.state.rpcListProviders();
  }

  rpcSend(request: RequestRpcSend, port: Port): Promise<JsonRpcResponse<unknown>> {
    return this.state.rpcSend(request, port);
  }

  rpcStartProvider(key: string, port: Port): ProviderMeta {
    return this.state.rpcStartProvider(key, port);
  }

  async rpcSubscribe(request: RequestRpcSubscribe, id: string, port: Port): Promise<boolean> {
    const innerCb = createSubscription<'pub(rpc.subscribe)'>(id, port);
    const cb = (_error: Error | null, data: SubscriptionMessageTypes['pub(rpc.subscribe)']): void => innerCb(data);
    const subscriptionId = await this.state.rpcSubscribe(request, cb, port);

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      withErrorLog(() => this.rpcUnsubscribe({ ...request, subscriptionId }, port));
    });

    return true;
  }

  async rpcSubscribeConnected(request: null, id: string, port: Port): Promise<boolean> {
    const innerCb = createSubscription<'pub(rpc.subscribeConnected)'>(id, port);
    const cb = (_error: Error | null, data: SubscriptionMessageTypes['pub(rpc.subscribeConnected)']): void =>
      innerCb(data);

    this.state.rpcSubscribeConnected(request, cb, port);

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
    });

    return Promise.resolve(true);
  }

  rpcUnsubscribe(request: RequestRpcUnsubscribe, port: Port): Promise<boolean> {
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

  saveSoraCardRefreshToken(token: string): void {
    this.state.soraCardService.tokenSubject.next(token);
  }

  async handle<TMessageType extends MessageTypes>(
    id: string,
    type: TMessageType,
    request: RequestTypes[TMessageType],
    url: string,
    port: Port
  ): Promise<ResponseTypes[keyof ResponseTypes]> {
    if (type === 'pub(phishing.redirectIfDenied)') return this.redirectIfPhishing(url);

    if (type !== 'pub(authorize.tab)') await this.state.requestService.ensureUrlAuthorized(url);

    switch (type) {
      case 'pub(authorize.tab)':
        return this.authorize(url, request as RequestAuthorizeTab);

      case 'pub(soraCard.token)':
        return this.saveSoraCardRefreshToken(request as string);

      case 'pub(accounts.list)':
        return this.accountsListAuthorized(url, request as RequestAccountList);

      case 'pub(accounts.subscribe)':
        return this.accountsSubscribeAuthorized(url, id, port);

      case 'pub(accounts.unsubscribe)':
        return this.accountsUnsubscribe(url, request as RequestAccountUnsubscribe);

      case 'pub(bytes.sign)':
        return this.bytesSign(url, request as SignerPayloadRaw);

      case 'pub(extrinsic.sign)':
        return this.extrinsicSign(url, request as SignerPayloadJSON);

      case 'pub(metadata.list)':
        return this.metadataList();

      case 'pub(metadata.provide)':
        return this.metadataProvide(url, request as MetadataDef);

      case 'pub(rpc.listProviders)':
        return this.rpcListProviders();

      case 'pub(rpc.send)':
        return this.rpcSend(request as RequestRpcSend, port);

      case 'pub(rpc.startProvider)':
        return this.rpcStartProvider(request as string, port);

      case 'pub(rpc.subscribe)':
        return this.rpcSubscribe(request as RequestRpcSubscribe, id, port);

      case 'pub(rpc.subscribeConnected)':
        return this.rpcSubscribeConnected(request as null, id, port);

      case 'pub(rpc.unsubscribe)':
        return this.rpcUnsubscribe(request as RequestRpcUnsubscribe, port);

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
