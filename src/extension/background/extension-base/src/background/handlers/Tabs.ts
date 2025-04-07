import { checkIfDenied } from '@polkadot/phishing';
import { chrome } from '@extension-base/utils/crossenv';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import { type RequestArguments } from '@json-rpc-tools/utils';
import { type RequestEvmProviderSend } from '@extension-base/page/types';
import { EipService } from '../../services/eip-service';
import type State from '@extension-base/background/handlers/State';
import type {
  DecryptForCosignerData,
  EncryptByCosignerData,
  AccountSub,
  MessageTypes,
  Port,
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
import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { JsonRpcResponse } from '@polkadot/rpc-provider/types';
import type {
  InjectedAccount,
  InjectedMetadataKnown,
  MetadataDef,
  ProviderMeta,
} from '@polkadot/extension-inject/types';
import { stripUrl, withErrorLog } from '@/extension/background/extension-base/src/background/helpers';
import {
  transformAccounts,
  transformAddresses,
} from '@/extension/background/extension-base/src/background/helpers/accounts';

export default class Tabs {
  accountSubs: Record<string, AccountSub> = {};
  eipService: EipService;

  constructor(public state: State) {
    this.eipService = new EipService(state);
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

  async accountsListAuthorized(url: string): Promise<InjectedAccount[]> {
    const transformedAccounts = transformAccounts({ accounts: this.state.keyringService.accountSubject.value });
    const transformedAddresses = transformAddresses({ accounts: this.state.keyringService.addressSubject.value });
    const totalAccounts = [...transformedAccounts, ...transformedAddresses];
    const filteredAuths = await this.filterForAuthorizedAccounts(totalAccounts, url);

    return filteredAuths;
  }

  async accountsSubscribeAuthorized(url: string, id: string, port: Port): Promise<string> {
    const cb = this.state.subscriptionService.createSubscription<'pub(accounts.subscribe)'>(id, port);

    this.accountSubs[id] = {
      subscription: this.state.keyringService.accountSubject.subscribe(async (accounts: SubjectInfo): Promise<void> => {
        const transformedAccounts = transformAccounts({ accounts });
        const transformedMobileAccount = transformAddresses({
          accounts: this.state.keyringService.addressSubject.value,
        });
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

    this.state.subscriptionService.cancelSubscription(id);

    sub.subscription.unsubscribe();

    return true;
  }

  bytesSign(url: string, request: SignerPayloadRaw): Promise<ResponseSigning> {
    const address = request.address;

    const pair = this.state.keyringService.getPair(address)!;
    const signer = new RequestBytesSign(request);

    return this.state.requestService.substrateRequestHandler.sign(url, signer, {
      address: pair.address,
      ethereumAddress: pair.meta.ethereumAddress as string,
      name: (pair.meta.name as string) ?? '',
      ...pair.meta,
    });
  }

  extrinsicSign(url: string, request: SignerPayloadJSON): Promise<ResponseSigning> {
    const address = this.state.keyringService.encodeAddress(request.address);
    const isMobile = !!this.state.keyringService.getAddress(address, 'address')?.meta.isMobile;
    const pair = this.state.keyringService.getPair(address);

    let meta;

    if (pair) meta = pair.meta;
    else if (isMobile) meta = this.state.keyringService.getAddress(address, 'address')?.meta;

    const signer = new RequestExtrinsicSign(request, isMobile);

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
    return this.state.requestService.knownMetadata.map(({ genesisHash, specVersion }) => ({
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
    const innerCb = this.state.subscriptionService.createSubscription<'pub(rpc.subscribe)'>(id, port);
    const cb = (_error: Error | null, data: SubscriptionMessageTypes['pub(rpc.subscribe)']): void => innerCb(data);
    const subscriptionId = await this.state.rpcSubscribe(request, cb, port);

    port.onDisconnect.addListener((): void => {
      this.state.subscriptionService.cancelSubscription(id);

      withErrorLog(() => this.rpcUnsubscribe({ ...request, subscriptionId }, port));
    });

    return true;
  }

  async rpcSubscribeConnected(request: null, id: string, port: Port): Promise<boolean> {
    const innerCb = this.state.subscriptionService.createSubscription<'pub(rpc.subscribeConnected)'>(id, port);

    const cb = (_error: Error | null, data: SubscriptionMessageTypes['pub(rpc.subscribeConnected)']): void =>
      innerCb(data);

    this.state.rpcSubscribeConnected(request, cb, port);

    port.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));

    return Promise.resolve(true);
  }

  rpcUnsubscribe(request: RequestRpcUnsubscribe, port: Port): Promise<boolean> {
    return this.state.rpcUnsubscribe(request, port);
  }

  async redirectIfPhishing(url: string): Promise<boolean> {
    return await checkIfDenied(url);
  }

  async handle<TMessageType extends MessageTypes>(
    id: string,
    type: TMessageType,
    request: RequestTypes[TMessageType],
    url: string,
    port: Port
  ): Promise<ResponseTypes[keyof ResponseTypes]> {
    if (type === 'pub(phishing.redirectIfDenied)') return this.redirectIfPhishing(url);

    if (type !== 'pub(authorize.tab)' && type !== 'evm(request)' && type !== 'evm(authorizeUrl)')
      await this.state.requestService.ensureUrlAuthorized(url);

    if (
      (type === 'pub(authorize.tab)' ||
        type === 'evm(authorizeUrl)' ||
        type === 'evm(events.subscribe)' ||
        type === 'evm(request)') &&
      this.state.keyringService.getAllSubstrateAccounts().length === 0
    )
      return;

    switch (type) {
      case 'pub(authorize.tab)':
        return this.state.requestService.authorizeUrl(url, request as RequestAuthorizeTab);

      case 'pub(decrypt.cosigner)':
        return this.state.keyringService.decryptForCosigner(request as DecryptForCosignerData);

      case 'pub(encrypt.cosigner)':
        return this.state.keyringService.encryptByCosigner(request as EncryptByCosignerData);

      case 'pub(accounts.list)':
        return this.accountsListAuthorized(url);

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

      //EVM
      case 'evm(authorizeUrl)':
        return this.eipService.requestEvmPermission(url, id, request as RequestArguments);

      case 'evm(events.subscribe)':
        return this.eipService.evmSubscribeEvents(url, id, port);

      case 'evm(request)':
        return this.eipService.handleEvmRequest(id, url, request as RequestArguments);

      case 'evm(provider.send)':
        return this.eipService.handleEvmSend(id, url, port, request as RequestEvmProviderSend);

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
