import { toBeHex, type JsonRpcPayload } from 'ethers';
import { type RequestEvmProviderSend, type EvmEventType } from '@extension-base/page/types';
import { CRON_GET_API_MAP_STATUS } from '@extension-base/const/intervals';
import { captureEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';
import { createSigningRequestId } from '@extension-base/services/request-service/signingRequestId';
import type { RequestArguments } from '@walletconnect/jsonrpc-types';
import type State from '@extension-base/background/handlers/State';
import type { EvmAppState, EvmProvider } from '@extension-base/background/types/types';
import { stripUrl } from '@/extension/background/extension-base/src/background/helpers';
import { APP_VERSION } from '@/consts/global';

type EvmEmitterCallback = (eventName: EvmEventType, payload: unknown) => void;

export class EipService {
  private evmEventEmitterMap: Record<string, Record<string, EvmEmitterCallback>> = {};

  constructor(private state: State) {}

  async getNetworkVersion(url: string) {
    const chainId = await this.getEvmCurrentChainId(url);

    return BigInt(chainId).toString();
  }

  private async getEvmProvider(url: string): Promise<EvmProvider | undefined> {
    const evmState = await this.getEvmState(url);

    return evmState.web3;
  }

  private async performWeb3Method(
    id: string,
    url: string,
    { method, params }: RequestArguments,
    callback?: (result: unknown) => void
  ) {
    const provider = await this.getEvmProvider(url);

    if (!provider) throw new Error('EVM provider is unavailable');

    const result = await provider._send({ jsonrpc: '2.0', method, params, id: id as unknown as number });
    const response = Array.isArray(result) ? result[0] : undefined;

    if (!response || typeof response !== 'object') throw new Error('Invalid EVM RPC response');
    if ('error' in response) throw response.error;
    if (!('result' in response)) throw new Error('Invalid EVM RPC response');

    callback?.(response.result);

    return response.result;
  }

  async getEvmState(url: string): Promise<EvmAppState> {
    let defaultChain: string | undefined;

    if (url) {
      const authInfo = await this.state.getAuthInfo(url);

      if (authInfo?.currentEvmNetworkKey) defaultChain = authInfo?.currentEvmNetworkKey;
    }

    const currentEvmNetwork = this.state.requestService.getEvmNetworkInfo({
      defaultChain,
      url,
    });

    const api = this.state.networkService.evmApiHandler.api[currentEvmNetwork?.name.toLowerCase() ?? '']?.api;

    return {
      networkKey: currentEvmNetwork?.name,
      chainId: toBeHex(BigInt(currentEvmNetwork?.chainId || 0)),
      web3: api,
    };
  }

  async getEvmCurrentChainId(url: string): Promise<string> {
    const evmState = await this.getEvmState(url);

    return evmState.chainId || '0x0';
  }

  private async switchEvmNetwork(url: string, { params }: RequestArguments) {
    const chainId = params[0].chainId as string;
    const chainIdDec = parseInt(chainId, 16);

    const evmState = await this.getEvmState(url);

    if (evmState.chainId === chainId) return null;

    const networkJson = this.state.networkService.findNetworkJsonByChainId(chainIdDec.toString());

    if (networkJson) await this.state.switchEvmNetworkByUrl(stripUrl(url), networkJson.name);
    else throw new Error(`Unknown network: ${chainId}`);

    return null;
  }

  private async getEvmCurrentAccount(url: string): Promise<string[]> {
    const authInfo = await this.state.getAuthInfo(url);

    return authInfo?.isAllowed === true && authInfo.evmAuthorizedAccount ? [authInfo.evmAuthorizedAccount] : [];
  }

  async requestEvmPermission(
    url: string,
    id: string,
    request: RequestArguments,
    reConfirm = false,
    signal?: AbortSignal
  ) {
    await this.state.requestService.authorizeUrl(
      url,
      {
        origin: request.params.origin,
        accountAuthType: 'evm',
        reConfirm,
      },
      signal
    );

    return this.getEvmPermission(url, id);
  }

  private async getEvmPermission(url: string, id: string) {
    const account = await this.getEvmCurrentAccount(url);

    if (!account.length) return [];

    return [
      {
        id: id,
        invoker: url,
        parentCapability: 'eth_accounts',
        caveats: [{ type: 'restrictReturnedAccounts', value: account }],
        date: new Date().getTime(),
      },
    ];
  }

  async evmSubscribeEvents(url: string, id: string, port: chrome.runtime.Port) {
    // This method will be called after DApp request connect to extension
    const cb = this.state.subscriptionService.createSubscription<'evm(events.subscribe)'>(id, port);

    const emitEvent = (eventName: EvmEventType, payload: unknown) => {
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

    const accountListSubscription = this.state.keyringService.currentAccountSubject.subscribe(onCurrentAccountChanged);

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

      onCurrentAccountChanged();
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
            .then(() => emitEvent('connect', { chainId: evmState?.chainId }))
            .catch(() => emitEvent('disconnect', 'Chain disconnectied'));
        })
        .catch(console.error);
    };

    const networkCheckInterval = setInterval(networkCheck, CRON_GET_API_MAP_STATUS);

    const provider = await this.getEvmProvider(url);

    const eventMap: Record<string, (...args: unknown[]) => void> = {};

    eventMap.data = (payload: unknown) => {
      const { method, params } = payload as JsonRpcPayload;

      emitEvent('message', { type: method, data: params });
    };

    eventMap.error = (rs: unknown) => {
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

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => {
      if (this.evmEventEmitterMap[url][id]) delete this.evmEventEmitterMap[url][id];

      Object.entries(eventMap).forEach(([event, callback]) => {
        provider?.removeListener(event, callback);
      });

      accountListSubscription.unsubscribe();
      authUrlSubscription.unsubscribe();

      clearInterval(networkCheckInterval);
    });

    port.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));

    return true;
  }

  async handleEvmSend(id: string, url: string, port: chrome.runtime.Port, request: RequestEvmProviderSend) {
    const cb = this.state.subscriptionService.createSubscription<'evm(provider.send)'>(id, port);
    const evmState = await this.getEvmState(url);

    const provider = evmState.web3!;

    provider.send(request.jsonrpc, []).then((result) => {
      cb({ error: null, result });

      this.state.subscriptionService.cancelSubscription(id);
    });

    port.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));

    return true;
  }

  private async revokeEvmPermission(url: string) {
    const idStr = stripUrl(url);
    await this.state.requestService.mutateAuthorizations((entries) => {
      if (entries[idStr]) entries[idStr].evmAuthorizedAccount = '';
    });
  }

  // `_messageId` is the page's own message id. It is never a queue key: the page chooses it, so it could equal the key
  // of a request another site queued, and approving the request on screen would then sign this one instead.
  private async evmSign(
    _messageId: string,
    url: string,
    { method, params }: RequestArguments,
    signal?: AbortSignal
  ): Promise<string> {
    const data = structuredClone(params);
    const context = await captureEvmSigningContext(this.state, url, method, data);
    const signResult = await this.state.requestService.evmRequestHandler.confirmSign(
      createSigningRequestId('evm'),
      url,
      method,
      data,
      context,
      signal
    );

    if (signResult) return signResult.payload;
    else throw new Error('Failed to sign message');
  }

  async evmSendTransaction(id: string, url: string, payload: RequestArguments, signal?: AbortSignal): Promise<string> {
    return this.evmSign(id, url, payload, signal);
  }

  // `signal` is aborted when the page's port closes; the requests this call queued then end.
  async handleEvmRequest(id: string, url: string, request: RequestArguments, signal?: AbortSignal): Promise<unknown> {
    try {
      switch (request.method) {
        case 'eth_chainId':
          return this.getEvmCurrentChainId(url);

        case 'web3_clientVersion':
          return `Fearless Wallet v${APP_VERSION}`;

        case 'net_version':
          return this.getNetworkVersion(url);

        case 'eth_accounts':
          return this.getEvmCurrentAccount(url);

        case 'wallet_requestPermissions':
          return this.requestEvmPermission(url, id, { ...request }, true, signal);

        case 'wallet_getPermissions':
          return this.getEvmPermission(url, id);

        case 'wallet_revokePermissions':
          return this.revokeEvmPermission(url);

        case 'wallet_switchEthereumChain':
          return this.switchEvmNetwork(url, request);

        case 'eth_sendTransaction':
          return this.evmSendTransaction(id, url, request, signal);

        case 'eth_sign':
        case 'personal_sign':
        case 'eth_signTypedData':
        case 'eth_signTypedData_v1':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4':
          return this.evmSign(id, url, request, signal);

        default:
          return this.performWeb3Method(id, url, request);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
