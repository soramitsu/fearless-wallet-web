import { formatJsonRpcError } from '@json-rpc-tools/utils';
import State from '@extension-base/background/handlers/State';
import WalletConnect from '@walletconnect/sign-client';
import { EngineTypes, SessionTypes, SignClientTypes } from '@walletconnect/types';
import { getInternalError, getSdkError } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import { RequestService } from '..';
import { storage } from '../../stores/Storage';
import WalletConnectStorage from './storage';
import { ALL_WALLET_CONNECT_EVENT, DEFAULT_WALLET_CONNECT_OPTIONS, WALLET_CONNECT_SUPPORTED_METHODS } from './consts';
import { EIP155_SIGNING_METHODS, ResultApproveWalletConnectSession, WalletConnectSigningMethod } from './types';
import { convertConnectRequest, convertNotSupportRequest } from './utils';
import Eip155Handler from './requestHandlers/Eip155Handler';

export class WalletConnectService {
  readonly state: State;
  readonly requestService: RequestService;
  readonly eip155RequestHandler: Eip155Handler;
  private client: WalletConnect | undefined;
  public readonly sessionSubject: BehaviorSubject<SessionTypes.Struct[]> = new BehaviorSubject<SessionTypes.Struct[]>(
    []
  );

  constructor(state: State, requestService: RequestService) {
    this.state = state;
    this.requestService = requestService;
    this.eip155RequestHandler = new Eip155Handler(this.state, this, requestService);

    this.initClient().catch(console.error);
  }

  async haveData(): Promise<boolean> {
    const data = await storage.get([
      'wc@2:client:0.3//session',
      'wc@2:core:0.3//pairing',
      'wc@2:core:0.3//subscription',
      'wc@2:core:0.3//history',
    ]);

    const sessionStorage = data['wc@2:client:0.3//session'];
    const historyStorage = data['wc@2:core:0.3//history'];
    const pairingStorage = data['wc@2:core:0.3//pairing'];
    const subscriptionStorage = data['wc@2:core:0.3//subscription'];
    const sessions: Array<unknown> = sessionStorage ? sessionStorage : [];
    const pairings: Array<unknown> = pairingStorage ? pairingStorage : [];
    const subscriptions: Array<unknown> = subscriptionStorage ? subscriptionStorage : [];
    const history: Array<unknown> = historyStorage ? historyStorage : [];

    return !!sessions.length || !!pairings.length || !!subscriptions.length || !!history.length;
  }

  public addConnection(uri: string) {
    console.info(uri);
  }

  public get sessions(): SessionTypes.Struct[] {
    return this.client?.session.values || [];
  }

  updateSessions() {
    this.sessionSubject.next(this.sessions);
  }

  public getSession(key: string): SessionTypes.Struct {
    const session = this.client?.session.get(key);

    if (!session) {
      throw new Error(getInternalError('MISMATCHED_TOPIC').message);
    } else {
      return session;
    }
  }

  async initClient(force?: boolean) {
    this.removeListener();
    const isHaveData = await this.haveData();

    if (force || isHaveData) {
      this.client = await WalletConnect.init({
        ...DEFAULT_WALLET_CONNECT_OPTIONS,
        storage: new WalletConnectStorage(),
      });
    }

    this.updateSessions();
    this.createListener();
  }

  public async responseRequest(response: EngineTypes.RespondParams) {
    this.checkClient();

    await this.client?.respond(response);
  }

  checkClient() {
    if (!this.client) {
      throw new Error(getInternalError('NOT_INITIALIZED').message);
    }
  }

  public async connect(uri: string) {
    const haveData = await this.haveData();

    if (!haveData) await this.initClient(true);

    this.checkClient();

    await this.client?.pair({ uri });
  }

  public async approveSession(result: ResultApproveWalletConnectSession) {
    this.checkClient();

    await this.client?.approve(result);

    this.updateSessions();
  }

  public async rejectSession(id: number) {
    this.checkClient();

    await this.client?.reject({ id, reason: getSdkError('USER_REJECTED') });
  }

  onSessionProposal(proposal: SignClientTypes.EventArguments['session_proposal']) {
    this.checkClient();

    this.requestService.addConnectWCRequest(convertConnectRequest(proposal));
  }

  onSessionRequest(requestEvent: SignClientTypes.EventArguments['session_request']) {
    this.checkClient();

    const { id, params, topic } = requestEvent;
    const { chainId, request } = params;
    const method = request.method as WalletConnectSigningMethod;

    try {
      const { namespaces: _namespaces } = this.getSession(topic);

      const namespaces = Object.keys(_namespaces);
      const chains = Object.values(_namespaces)
        .map((namespace) => namespace.chains)
        .flat();

      const methods = Object.values(_namespaces)
        .map((namespace) => namespace.methods)
        .flat();

      // const chainInfoMap = this.state.getNetworkMap;

      const [requestNamespace] = chainId.split(':');

      if (!namespaces.includes(requestNamespace)) {
        throw Error(getSdkError('UNSUPPORTED_NAMESPACE_KEY').message);
      }

      if (!chains.includes(chainId)) {
        throw Error(getSdkError('UNSUPPORTED_CHAINS').message + ' ' + chainId);
      }

      // if (!isSupportWalletConnectChain(chainId, chainInfoMap)) {
      //   throw Error(getSdkError('UNSUPPORTED_CHAINS').message + ' ' + chainId);
      // }

      if (!methods.includes(method)) {
        throw Error(getSdkError('UNAUTHORIZED_METHOD').message + ' ' + method);
      }

      if (!WALLET_CONNECT_SUPPORTED_METHODS.includes(method)) {
        throw Error(getSdkError('UNSUPPORTED_METHODS').message + ' ' + method);
      }

      switch (method) {
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
  }

  createListener() {
    this.client?.on('session_proposal', this.onSessionProposal.bind(this));
    this.client?.on('session_request', this.onSessionRequest.bind(this));
    this.client?.on('session_ping', (data: unknown) => console.info('ping', data));
    this.client?.on('session_event', (data: unknown) => console.info('event', data));
    this.client?.on('session_update', (data: unknown) => console.info('update', data));
    this.client?.on('session_delete', this.updateSessions.bind(this));
  }

  public async disconnect(topic: string) {
    await this.client?.disconnect({
      topic: topic,
      reason: getSdkError('USER_DISCONNECTED'),
    });

    this.updateSessions();
  }

  // Remove old listener
  removeListener() {
    ALL_WALLET_CONNECT_EVENT.forEach((event) => {
      this.client?.removeAllListeners(event);
    });
  }
}
