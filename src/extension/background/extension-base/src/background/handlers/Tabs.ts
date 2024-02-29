import { PHISHING_PAGE_REDIRECT } from '@extension-base/defaults';
import { checkIfDenied } from '@polkadot/phishing';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { chrome } from '@polkadot/extension-inject/chrome';
import { assert, isNumber } from '@polkadot/util';
import {
  stripUrl,
  transformAccounts,
  transformAddresses,
  withErrorLog,
} from '@extension-base/background/handlers/helpers';
import { createSubscription, unsubscribe } from '@extension-base/services';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import { type RequestArguments } from '@json-rpc-tools/utils';
import { type JsonRpcPayload } from 'ethers';
import { type RequestEvmProviderSend, type EvmEventType } from '@extension-base/page/types';
import { CRON_GET_API_MAP_STATUS } from '@extension-base/const/intervals';
import type State from '@extension-base/background/handlers/State';
import type {
  AccountSub,
  AuthUrlInfo,
  AuthUrls,
  EvmAppState,
  EvmProvider,
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

type EvmEmitterCallback = (eventName: EvmEventType, payload: unknown) => void;
export default class Tabs {
  accountSubs: Record<string, AccountSub>;
  state: State;
  private evmEventEmitterMap: Record<string, Record<string, EvmEmitterCallback>> = {};

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
    const transformedAccounts = transformAccounts({ accounts: this.state.keyringService.accountSubjectValue, anyType });
    const transformedAddresses = transformAddresses(this.state.keyringService.addressesSubjectValue);
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

  public isEvmPublicRequest(type: string, request: RequestArguments) {
    return type === 'evm(request)' && ['eth_chainId', 'net_version'].includes(request?.method);
  }

  async accountsSubscribeAuthorized(url: string, id: string, port: Port): Promise<string> {
    const cb = createSubscription<'pub(accounts.subscribe)'>(id, port);

    this.accountSubs[id] = {
      subscription: accountsObservable.subject.subscribe(async (accounts: SubjectInfo): Promise<void> => {
        const transformedAccounts = transformAccounts({ accounts });
        const transformedMobileAccount = transformAddresses(this.state.keyringService.addressesSubjectValue);
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
    const pair = this.state.keyringService.getPair(address);

    assert(pair, 'Unable to find keypair');

    return pair;
  }

  bytesSign(url: string, request: SignerPayloadRaw): Promise<ResponseSigning> {
    const address = request.address;

    const pair = this.getSigningPair(address);
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
    let meta;

    if (this.state.keyringService.getAccount(address)) meta = this.getSigningPair(address).meta;
    else if (isMobile) meta = this.state.keyringService.getAddress(address, 'address')?.meta;

    const signer = new RequestExtrinsicSign(request);

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

  async getEvmState(url: string): Promise<EvmAppState> {
    let currentChain: string | undefined;
    let autoActive = false;

    if (url) {
      const authInfo = await this.getAuthInfo(url);

      if (authInfo?.currentEvmNetworkKey) {
        currentChain = authInfo?.currentEvmNetworkKey;
      }

      if (authInfo?.isAllowed) autoActive = true;
    }

    const currentEvmNetwork = this.state.requestService.getDAppNetworkInfo({
      autoActive,
      accessType: 'evm',
      defaultChain: currentChain,
      url,
    });

    const api = this.state.networkService.evmApiHandler.api[currentEvmNetwork?.name.toLowerCase() ?? ''].api;

    return {
      networkKey: currentEvmNetwork?.name,
      chainId: currentEvmNetwork?.chainId,
      web3: api,
    };
  }

  private async getEvmProvider(url: string): Promise<EvmProvider | undefined> {
    const evmState = await this.getEvmState(url);
    let provider = evmState.web3;

    if (!provider) {
      await this.getEvmCurrentChainId(url);
      provider = evmState.web3;
    }

    return provider;
  }

  private async evmSubscribeEvents(url: string, id: string, port: chrome.runtime.Port) {
    // This method will be called after DApp request connect to extension
    const cb = createSubscription<'evm(events.subscribe)'>(id, port);
    let isConnected = false;

    const emitEvent = (eventName: EvmEventType, payload: any) => {
      cb({ type: eventName, payload });
    };

    // Detect accounts changed
    let currentAccountList = await this.getEvmCurrentAccount(url);

    const onCurrentAccountChanged = async () => {
      const newAccountList = await this.getEvmCurrentAccount(url);

      // Compare to void looping reload
      if (JSON.stringify(currentAccountList) !== JSON.stringify(newAccountList)) {
        emitEvent('accountsChanged', newAccountList);
        currentAccountList = newAccountList;
      }
    };

    const accountListSubscription = this.state.keyringService.currentAccountSubject.subscribe(() => {
      onCurrentAccountChanged().catch(console.error);
    });

    // Detect network chain
    const evmState = await this.getEvmState(url);
    let currentChainId = evmState.chainId;

    const _onAuthChanged = async () => {
      // Detect network
      const { chainId } = await this.getEvmState(url);

      if (chainId !== currentChainId) {
        emitEvent('chainChanged', chainId);
        currentChainId = chainId;
      }

      // Detect account
      const newAccountList = await this.getEvmCurrentAccount(url);

      // Compare to void looping reload
      if (JSON.stringify(currentAccountList) !== JSON.stringify(newAccountList)) {
        emitEvent('accountsChanged', newAccountList);
        currentAccountList = newAccountList;
      }
    };

    const authUrlSubscription = this.state.requestService.subscribeAuthorizeUrlSubject.subscribe(() => {
      _onAuthChanged().catch(console.error);
    });

    // Detect network connection
    const networkCheck = () => {
      this.getEvmState(url)
        .then((evmState) => {
          evmState.web3
            ?.getBlock('latest')
            .then((block) => {
              if (block && !isConnected) {
                emitEvent('connect', { chainId: evmState.chainId });
              } else if (!block && isConnected) {
                emitEvent('disconnect', 'Chain disconnectied');
              }

              isConnected = true;
            })
            .catch(console.error);
        })
        .catch(console.error);
    };

    const networkCheckInterval = setInterval(networkCheck, CRON_GET_API_MAP_STATUS);

    const provider = await this.getEvmProvider(url);

    const eventMap: Record<string, any> = {};

    eventMap.data = ({ method, params }: JsonRpcPayload) => {
      emitEvent('message', { type: method, data: params });
    };

    eventMap.error = (rs: Error) => {
      emitEvent('error', rs);
    };

    Object.entries(eventMap).forEach(([event, callback]) => {
      provider?.on(event, callback);
    });

    // Add event emitter
    if (!this.evmEventEmitterMap[url]) {
      this.evmEventEmitterMap[url] = {};
    }

    this.evmEventEmitterMap[url][id] = emitEvent;
    this.state.createUnsubscriptionHandle(id, () => {
      if (this.evmEventEmitterMap[url][id]) delete this.evmEventEmitterMap[url][id];

      Object.entries(eventMap).forEach(([event, callback]) => {
        provider?.removeListener(event, callback);
      });

      accountListSubscription.unsubscribe();
      authUrlSubscription.unsubscribe();
      clearInterval(networkCheckInterval);
    });

    port.onDisconnect.addListener((): void => {
      this.state.cancelSubscription(id);
    });

    return true;
  }

  private async getEvmCurrentAccount(url: string): Promise<string[]> {
    return new Promise((resolve) => {
      this.getAuthInfo(url)
        .then((authInfo) => {
          const allAccounts = this.state.keyringService.accountSubject.value;

          const accountList = transformAccounts({
            accounts: allAccounts,
            anyType: false,
            authInfo,
            accountAuthType: 'evm',
          }).map(({ address }) => address);
          let accounts: string[] = [];

          const address = this.state.currentAccount?.ethereumAddress;
          const isAuthorizedAddress = authInfo?.authorizedAccounts.some(
            (el) => el.toLowerCase() === address?.toLowerCase()
          );
          if (address && accountList.includes(address) && isAuthorizedAddress) {
            const result = accountList.filter((adr) => adr !== address);

            result.unshift(address);
            accounts = result;
          } else accounts = accountList;

          resolve(accounts);
        })
        .catch(console.error);
    });
  }

  async getEvmCurrentChainId(url: string): Promise<string> {
    const evmState = await this.getEvmState(url);

    return evmState.chainId || '0x0';
  }

  async getNetworkVersion(url: string) {
    const chainId = await this.getEvmCurrentChainId(url);

    return parseInt(chainId, 16);
  }

  private async performWeb3Method(
    id: string,
    url: string,
    { method, params }: RequestArguments,
    callback?: (result: unknown) => void
  ) {
    const provider = await this.getEvmProvider(url);

    return new Promise((resolve, reject) => {
      provider
        ?._send({
          jsonrpc: '2.0',
          method: method,
          params: params as any[],
          id: +id,
        })
        .then((result) => {
          const err = (result[0] as any).error;

          if (err) reject(err);
          else {
            const rs = (result[0] as any).result as unknown;

            callback && callback(rs);
            resolve(rs);
          }
        });
    });
  }

  private async switchEvmNetwork(url: string, { params }: RequestArguments) {
    const chainId = params[0].chainId as string;
    const chainIdDec = parseInt(chainId, 16);

    const evmState = await this.getEvmState(url);

    if (evmState.chainId === chainId) return null;

    const [networkKey] = this.state.networkService.findNetworkKeyByChainId(chainIdDec.toString());

    if (networkKey) await this.state.switchEvmNetworkByUrl(stripUrl(url), networkKey);
    else throw new Error('Unknown network');

    return null;
  }

  private async getEvmPermission(url: string, id: string) {
    const accounts = await this.getEvmCurrentAccount(url);

    return [
      {
        id: id,
        invoker: url,
        parentCapability: 'eth_accounts',
        caveats: [{ type: 'restrictReturnedAccounts', value: accounts }],
        date: new Date().getTime(),
      },
    ];
  }

  private async evmSign(id: string, url: string, { method, params }: RequestArguments): Promise<ResponseSigning> {
    const signResult = await this.state.requestService.evmRequestHandler.confirmSign(id, url, method, params);

    if (signResult) return signResult;
    else throw new Error('Failed to sign message');
  }

  async evmSendTransaction(id: string, url: string, { method, params }: RequestArguments): Promise<ResponseSigning> {
    const signResult = await this.state.requestService.evmRequestHandler.confirmSign(id, url, method, params);

    if (signResult) return signResult;
    else throw new Error('Failed to sign message');
  }

  private async handleEvmRequest(id: string, url: string, request: RequestArguments): Promise<unknown> {
    const { method } = request;

    try {
      switch (method) {
        case 'eth_chainId':
          return this.getEvmCurrentChainId(url);

        case 'net_version':
          return this.getNetworkVersion(url);

        case 'eth_accounts':
          return this.getEvmCurrentAccount(url);

        case 'wallet_requestPermissions':
          await this.authorize(url, { origin: '', accountAuthType: 'evm', reConfirm: true });

          return this.getEvmPermission(url, id);

        case 'wallet_getPermissions':
          return this.getEvmPermission(url, id);

        case 'wallet_switchEthereumChain':
          return this.switchEvmNetwork(url, request);

        case 'eth_sendTransaction':
          return this.evmSendTransaction(id, url, request);

        case 'eth_sign':
        case 'personal_sign':
        case 'eth_signTypedData':
        case 'eth_signTypedData_v1':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4':
          return this.evmSign(id, url, request);

        default:
          return this.performWeb3Method(id, url, request);
      }
    } catch (e) {
      console.error(e);
    }
  }

  private async handleEvmSend(id: string, url: string, port: chrome.runtime.Port, request: RequestEvmProviderSend) {
    const cb = createSubscription<'evm(provider.send)'>(id, port);
    const evmState = await this.getEvmState(url);

    const provider = evmState.web3!;

    // this.checkAndHandleProviderStatus(provider);

    provider.send(request.jsonrpc, []).then((result) => {
      cb({ error: null, result });

      this.state.cancelSubscription(id);
    });

    port.onDisconnect.addListener((): void => {
      this.state.cancelSubscription(id);
    });

    return true;
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

      //EVM
      case 'evm(events.subscribe)':
        return await this.evmSubscribeEvents(url, id, port);

      case 'evm(request)':
        return await this.handleEvmRequest(id, url, request as RequestArguments);

      case 'evm(provider.send)':
        return await this.handleEvmSend(id, url, port, request as RequestEvmProviderSend);

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
