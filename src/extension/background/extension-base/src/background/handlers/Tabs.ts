import { checkIfDenied } from '@polkadot/phishing';
import { chrome } from '@extension-base/utils/crossenv';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import {
  type RequestEvmProviderSend,
  type IrohaConnectRequest,
  type IrohaConnectResponse,
  type IrohaNetworkKey,
  type SolanaAccountInfo,
  type SolanaSignAllTransactionsRequest,
  type SolanaSignAndSendTransactionRequest,
  type SolanaConnectRequest,
  type SolanaConnectResponse,
  type SolanaSignMessageRequest,
  type SolanaSignTransactionRequest,
} from '@extension-base/page/types';
import { EipService } from '../../services/eip-service';
import { SolanaRpcClient } from '../../services/solana-rpc-service';
import type { RequestArguments } from '@walletconnect/jsonrpc-types';
import type State from '@extension-base/background/handlers/State';
import type {
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
  transformIrohaAccounts,
  transformSolanaAccounts,
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

  private getAllSolanaAccounts(): SolanaAccountInfo[] {
    const accounts = [
      ...transformSolanaAccounts({ accounts: this.state.keyringService.accountSubject.value }),
      ...transformSolanaAccounts({ accounts: this.state.keyringService.addressSubject.value }),
    ];
    const uniqueAccounts = new Map<string, SolanaAccountInfo>();

    accounts.forEach((account) => {
      if (!uniqueAccounts.has(account.address)) uniqueAccounts.set(account.address, account);
    });

    return [...uniqueAccounts.values()];
  }

  private getAllIrohaAccounts(network: IrohaNetworkKey = 'nexus'): IrohaConnectResponse['accounts'] {
    const accounts = [
      ...transformIrohaAccounts({ accounts: this.state.keyringService.accountSubject.value }, network),
      ...transformIrohaAccounts({ accounts: this.state.keyringService.addressSubject.value }, network),
    ];
    const uniqueAccounts = new Map<string, IrohaConnectResponse['accounts'][number]>();

    accounts.forEach((account) => {
      if (!uniqueAccounts.has(account.address)) uniqueAccounts.set(account.address, account);
    });

    return [...uniqueAccounts.values()];
  }

  async solanaAccountsAuthorized(url: string): Promise<SolanaConnectResponse> {
    const authInfo = await this.state.getAuthInfo(url);
    const authorizedAddress = authInfo?.solanaAuthorizedAccount;
    const accounts = this.getAllSolanaAccounts().filter(({ address }) => address === authorizedAddress);

    return { accounts };
  }

  async solanaAuthorizeUrl(url: string, request: SolanaConnectRequest): Promise<SolanaConnectResponse> {
    if (request.silent) return this.solanaAccountsAuthorized(url);
    if (this.getAllSolanaAccounts().length === 0) return { accounts: [] };

    await this.state.requestService.authorizeUrl(url, {
      origin: request.origin,
      accountAuthType: 'solana',
    });

    return this.solanaAccountsAuthorized(url);
  }

  async solanaDisconnect(url: string): Promise<SolanaConnectResponse> {
    const idStr = stripUrl(url);
    const authList = await this.state.requestService.getAuthList();
    const authInfo = authList[idStr];

    if (authInfo) {
      this.state.requestService.setAuthorize({
        ...authList,
        [idStr]: {
          ...authInfo,
          solanaAuthorizedAccount: '',
        },
      });
    }

    return { accounts: [] };
  }

  async solanaSubscribeAccounts(url: string, id: string, port: Port): Promise<boolean> {
    const cb = this.state.subscriptionService.createSubscription<'solana(events.subscribe)'>(id, port);
    let previousPayload = '';

    const emitIfChanged = async (): Promise<void> => {
      const payload = await this.solanaAccountsAuthorized(url);
      const nextPayload = JSON.stringify(payload);

      if (nextPayload === previousPayload) return;

      previousPayload = nextPayload;
      cb(payload);
    };

    const accountSubscription = this.state.keyringService.accountSubject.subscribe(() => {
      emitIfChanged().catch(console.error);
    });
    const addressSubscription = this.state.keyringService.addressSubject.subscribe(() => {
      emitIfChanged().catch(console.error);
    });
    const authSubscription = this.state.requestService.subscribeAuthorizeUrlSubject.subscribe(() => {
      emitIfChanged().catch(console.error);
    });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => {
      accountSubscription.unsubscribe();
      addressSubscription.unsubscribe();
      authSubscription.unsubscribe();
    });

    port.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));
    await emitIfChanged();

    return true;
  }

  async irohaAccountsAuthorized(url: string, request?: IrohaConnectRequest | null): Promise<IrohaConnectResponse> {
    const network = request?.network ?? 'nexus';
    const authInfo = await this.state.getAuthInfo(url);
    const authorizedAddress = authInfo?.irohaAuthorizedAccount;
    const accounts = this.getAllIrohaAccounts(network).filter(({ address }) => address === authorizedAddress);

    return { accounts };
  }

  async irohaAuthorizeUrl(url: string, request: IrohaConnectRequest): Promise<IrohaConnectResponse> {
    if (request.silent) return this.irohaAccountsAuthorized(url, request);
    const accounts = this.getAllIrohaAccounts(request.network ?? 'nexus');

    if (accounts.length === 0) return { accounts: [] };

    await this.state.requestService.authorizeUrl(url, {
      origin: request.origin,
      accountAuthType: 'iroha',
      allowedAccounts: accounts.map(({ address }) => address),
    });

    return this.irohaAccountsAuthorized(url, request);
  }

  async irohaDisconnect(url: string): Promise<IrohaConnectResponse> {
    const idStr = stripUrl(url);
    const authList = await this.state.requestService.getAuthList();
    const authInfo = authList[idStr];

    if (authInfo) {
      this.state.requestService.setAuthorize({
        ...authList,
        [idStr]: {
          ...authInfo,
          irohaAuthorizedAccount: '',
        },
      });
    }

    return { accounts: [] };
  }

  async irohaSubscribeAccounts(
    url: string,
    request: IrohaConnectRequest | null,
    id: string,
    port: Port
  ): Promise<boolean> {
    const cb = this.state.subscriptionService.createSubscription<'iroha(events.subscribe)'>(id, port);
    let previousPayload = '';

    const emitIfChanged = async (): Promise<void> => {
      const payload = await this.irohaAccountsAuthorized(url, request);
      const nextPayload = JSON.stringify(payload);

      if (nextPayload === previousPayload) return;

      previousPayload = nextPayload;
      cb(payload);
    };

    const accountSubscription = this.state.keyringService.accountSubject.subscribe(() => {
      emitIfChanged().catch(console.error);
    });
    const addressSubscription = this.state.keyringService.addressSubject.subscribe(() => {
      emitIfChanged().catch(console.error);
    });
    const authSubscription = this.state.requestService.subscribeAuthorizeUrlSubject.subscribe(() => {
      emitIfChanged().catch(console.error);
    });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => {
      accountSubscription.unsubscribe();
      addressSubscription.unsubscribe();
      authSubscription.unsubscribe();
    });

    port.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));
    await emitIfChanged();

    return true;
  }

  async solanaSignMessage(url: string, request: SolanaSignMessageRequest) {
    return this.state.requestService.solanaRequestHandler.confirmSignMessage(
      url,
      request,
      await this.getAuthorizedSolanaAccount(url)
    );
  }

  async solanaSignTransaction(url: string, request: SolanaSignTransactionRequest) {
    return this.state.requestService.solanaRequestHandler.confirmSignTransaction(
      url,
      request,
      await this.getAuthorizedSolanaAccount(url)
    );
  }

  async solanaSignAndSendTransaction(url: string, request: SolanaSignAndSendTransactionRequest) {
    const rpcClient = new SolanaRpcClient({ network: 'mainnet' });
    const preflightCommitment = request.options?.preflightCommitment ?? 'confirmed';

    return this.state.requestService.solanaRequestHandler.confirmSignAndSendTransaction(
      url,
      request,
      await this.getAuthorizedSolanaAccount(url),
      undefined,
      (transactionBase64) =>
        rpcClient.simulateTransaction(transactionBase64, {
          commitment: preflightCommitment,
          replaceRecentBlockhash: true,
          sigVerify: false,
        }),
      (messageBase64) => rpcClient.getFeeForMessage(messageBase64, preflightCommitment)
    );
  }

  async solanaSignAllTransactions(url: string, request: SolanaSignAllTransactionsRequest) {
    return this.state.requestService.solanaRequestHandler.confirmSignAllTransactions(
      url,
      request,
      await this.getAuthorizedSolanaAccount(url)
    );
  }

  private async getAuthorizedSolanaAccount(url: string): Promise<SolanaAccountInfo> {
    const { accounts } = await this.solanaAccountsAuthorized(url);
    const account = accounts[0];

    if (!account) throw new Error('Solana account is not authorized');

    return {
      address: account.address,
      name: account.name ?? '',
      publicKey: account.publicKey,
    };
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

    if (
      type !== 'pub(authorize.tab)' &&
      type !== 'evm(request)' &&
      type !== 'evm(authorizeUrl)' &&
      type !== 'solana(authorizeUrl)' &&
      type !== 'solana(accounts)' &&
      type !== 'solana(disconnect)' &&
      type !== 'solana(events.subscribe)'
    )
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

      // Solana
      case 'solana(authorizeUrl)':
        return this.solanaAuthorizeUrl(url, request as SolanaConnectRequest);

      case 'solana(accounts)':
        return this.solanaAccountsAuthorized(url);

      case 'solana(disconnect)':
        return this.solanaDisconnect(url);

      case 'solana(events.subscribe)':
        return this.solanaSubscribeAccounts(url, id, port);

      case 'solana(signMessage)':
        return this.solanaSignMessage(url, request as SolanaSignMessageRequest);

      case 'solana(signTransaction)':
        return this.solanaSignTransaction(url, request as SolanaSignTransactionRequest);

      case 'solana(signAndSendTransaction)':
        return this.solanaSignAndSendTransaction(url, request as SolanaSignAndSendTransactionRequest);

      case 'solana(signAllTransactions)':
        return this.solanaSignAllTransactions(url, request as SolanaSignAllTransactionsRequest);

      // Iroha/Nexus
      case 'iroha(authorizeUrl)':
        return this.irohaAuthorizeUrl(url, request as IrohaConnectRequest);

      case 'iroha(accounts)':
        return this.irohaAccountsAuthorized(url, request as IrohaConnectRequest | null);

      case 'iroha(disconnect)':
        return this.irohaDisconnect(url);

      case 'iroha(events.subscribe)':
        return this.irohaSubscribeAccounts(url, request as IrohaConnectRequest | null, id, port);

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
