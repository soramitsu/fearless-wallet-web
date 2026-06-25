import { formatJsonRpcError } from '@walletconnect/jsonrpc-utils';
import WalletConnect from '@walletconnect/sign-client';
import { getInternalError, getSdkError, isValidUrl } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import { storage } from '@extension-base/stores/Storage';
import { convertConnectRequest, convertNotSupportRequest } from '@extension-base/services/wallet-connect-service/utils';
import {
  EIP155_SIGNING_METHODS,
  POLKADOT_SIGNING_METHODS,
  type ResultApproveWalletConnectSession,
  type WalletConnectSigningMethod,
} from '@extension-base/services/wallet-connect-service/types';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
import {
  ALL_WALLET_CONNECT_EVENT,
  DEFAULT_WALLET_CONNECT_OPTIONS,
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
} from '@extension-base/services/wallet-connect-service/consts';
import type State from '@extension-base/background/handlers/State';
import type { EngineTypes, SessionTypes, SignClientTypes } from '@walletconnect/types';
import type { RequestService } from '@extension-base/services';
import { PolkadotHandler } from '@/extension/background/extension-base/src/services/wallet-connect-service/requestHandlers/PolkadotHandler';
import { Eip155RequestHandler } from '@/extension/background/extension-base/src/services/wallet-connect-service/requestHandlers/Eip155Handler';
import { isSameString } from '@/helpers';

const namespaceAccounts = (namespace: SessionTypes.Namespace | unknown[]): string[] =>
  Array.isArray(namespace) ? [] : namespace.accounts ?? [];

export class WalletConnectService {
  private client?: WalletConnect;

  readonly eip155RequestHandler: Eip155RequestHandler;
  readonly polkadotRequestHandler: PolkadotHandler;
  readonly sessionSubject: BehaviorSubject<SessionTypes.Struct[]> = new BehaviorSubject<SessionTypes.Struct[]>([]);

  constructor(private state: State, private readonly requestService: RequestService) {
    this.eip155RequestHandler = new Eip155RequestHandler(this.state, this);
    this.polkadotRequestHandler = new PolkadotHandler(this.state, this);

    this.initClient().catch(console.error);
  }

  get sessions() {
    return this.client?.session.values || [];
  }

  private async haveData(): Promise<boolean> {
    const data = await storage.get([
      'wc@2:client:0.3//session',
      'wc@2:client:0.3//proposal',
      'wc@2:core:0.3//pairing',
      'wc@2:core:0.3//subscription',
      'wc@2:core:0.3//history',
    ]);

    const sessions = data['wc@2:client:0.3//session'] ?? [];
    const pairings = data['wc@2:core:0.3//pairing'] ?? [];
    const subscriptions = data['wc@2:core:0.3//subscription'] ?? [];
    const history = data['wc@2:core:0.3//history'] ?? [];
    const proposals = data['wc@2:client:0.3//proposal'] ?? [];

    return !!sessions.length || !!pairings.length || !!subscriptions.length || !!history.length || !!proposals.length;
  }

  addConnection(uri: string) {
    console.info(uri);
  }

  private updateSessions() {
    this.sessionSubject.next(this.sessions);
  }

  getSession(key: string): SessionTypes.Struct {
    const session = this.client?.session.get(key);

    if (!session) {
      throw new Error(getInternalError('MISMATCHED_TOPIC').message);
    } else {
      return session;
    }
  }

  async initClient(force?: boolean) {
    this.removeListener();

    const isInit = force || (await this.haveData());

    if (!isInit) return;

    this.client = await WalletConnect.init({
      ...DEFAULT_WALLET_CONNECT_OPTIONS,
      storage: new WalletConnectStorage(),
    });

    this.updateSessions();
    this.createListener();
  }

  public async responseRequest(response: EngineTypes.RespondParams) {
    this.checkClient();

    await this.client?.respond(response);
  }

  async connect(uri: string) {
    if (!isValidUrl(uri)) throw Error(getInternalError('MISSING_OR_INVALID').message);

    if (uri.match('@1')) throw Error(getInternalError('UNKNOWN_TYPE').message);

    const haveData = await this.haveData();

    if (!haveData) await this.initClient(true);

    this.checkClient();

    return this.client?.pair({ uri });
  }

  updateExpiry(topic: string) {
    this.client?.extend({ topic }).catch((e) => {
      console.info(e);
    });
  }

  async approveSession(result: ResultApproveWalletConnectSession) {
    this.checkClient();

    await this.client?.approve(result);

    this.updateSessions();
  }

  async rejectSession(id: number) {
    this.checkClient();

    await this.client?.reject({ id, reason: getSdkError('USER_REJECTED') });
  }

  async disconnect(topic: string) {
    await this.client?.disconnect({
      topic: topic,
      reason: getSdkError('USER_DISCONNECTED'),
    });

    this.updateSessions();
  }

  removeSessions(address: string, ethereumAddress?: string) {
    this.sessions.forEach((session) => {
      const evm = session.namespaces[WALLET_CONNECT_EIP155_NAMESPACE] ?? [];
      const polkadot = session.namespaces[WALLET_CONNECT_POLKADOT_NAMESPACE] ?? [];
      const evmAccounts = namespaceAccounts(evm);
      const polkadotAccounts = namespaceAccounts(polkadot);

      if (ethereumAddress && evmAccounts.length) {
        const [, , evmAddress] = evmAccounts[0].split(':');

        if (isSameString(ethereumAddress, evmAddress)) return this.disconnect(session.topic);
      }

      if (polkadotAccounts.length) {
        const [, , substrateAddress] = polkadotAccounts[0].split(':');

        if (isSameString(address, substrateAddress)) this.disconnect(session.topic);
      }
    });
  }

  private onSessionProposal(proposal: SignClientTypes.EventArguments['session_proposal']) {
    this.checkClient();

    this.requestService.addConnectWCRequest(convertConnectRequest(proposal));
  }

  private onSessionRequest(requestEvent: SignClientTypes.EventArguments['session_request']) {
    this.checkClient();

    const { id, params, topic } = requestEvent;
    const { chainId, request } = params;
    const method = request.method as WalletConnectSigningMethod;

    try {
      const { requiredNamespaces, optionalNamespaces } = this.getSession(topic);

      const namespaces = Object.keys({ ...requiredNamespaces, ...optionalNamespaces });
      const chains = Object.values(requiredNamespaces).flatMap((namespace) => namespace.chains ?? []);
      const optionalChains = Object.values(optionalNamespaces).flatMap((namespace) => namespace.chains ?? []);

      chains.push(...optionalChains);

      const [requestNamespace] = chainId.split(':');

      if (namespaces.length && !namespaces.includes(requestNamespace)) {
        throw Error(getSdkError('UNSUPPORTED_NAMESPACE_KEY').message);
      }

      if (chainId.length && !chains.includes(chainId)) {
        throw Error(getSdkError('UNSUPPORTED_CHAINS').message + ' ' + chainId);
      }

      switch (method) {
        case POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE:
        case POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_TRANSACTION:
          this.polkadotRequestHandler.handleRequest(requestEvent);

          break;
        case EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION:
        case EIP155_SIGNING_METHODS.PERSONAL_SIGN:
        case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA:
        case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3:
        case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4:
        case EIP155_SIGNING_METHODS.ETH_SIGN:
          this.eip155RequestHandler.handleRequest(requestEvent);

          break;
        default:
          throw Error(getSdkError('INVALID_METHOD').message + ' ' + method);
      }
    } catch (e) {
      console.info(e);

      try {
        const requestSession = this.getSession(topic);
        const notSupportRequest = convertNotSupportRequest(requestEvent, requestSession.peer.metadata.url);

        this.requestService.addNotSupportWCRequest(notSupportRequest);
      } catch (e) {
        console.info(e);
      }

      this.responseRequest({
        topic,
        response: formatJsonRpcError(id, (e as Error).message),
      }).catch(console.error);
    }

    this.updateExpiry(topic);
  }

  private checkClient() {
    if (!this.client) {
      throw new Error(getInternalError('NOT_INITIALIZED').message);
    }
  }

  private createListener() {
    this.client?.on('session_proposal', (event) => this.onSessionProposal(event));
    this.client?.on('session_request', (event) => this.onSessionRequest(event));
    this.client?.on('session_delete', () => this.updateSessions());
    this.client?.on('session_ping', (data: unknown) => console.info('ping', data));
    this.client?.on('session_event', (data: unknown) => console.info('event', data));
    this.client?.on('session_update', (data: unknown) => console.info('update', data));
  }

  // Remove old listener
  private removeListener() {
    ALL_WALLET_CONNECT_EVENT.forEach((event) => {
      this.client?.removeAllListeners(event);
    });
  }
}
