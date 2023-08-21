import { formatJsonRpcError } from '@json-rpc-tools/utils';
import State from '@extension-base/background/handlers/State';
import WalletConnect from '@walletconnect/sign-client';
import { EngineTypes, SessionTypes, SignClientTypes } from '@walletconnect/types';
import { getInternalError, getSdkError } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import { RequestService } from '..';
import WalletConnectStorage from './storage';
import { ALL_WALLET_CONNECT_EVENT, DEFAULT_WALLET_CONNECT_OPTIONS, WALLET_CONNECT_SUPPORTED_METHODS } from './consts';
import { EIP155_SIGNING_METHODS, ResultApproveWalletConnectSession, WalletConnectSigningMethod } from './types';
import { convertConnectRequest, convertNotSupportRequest, isSupportWalletConnectChain } from './utils';
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
    this.eip155RequestHandler = new Eip155Handler(this.state, this);

    this.initClient();
  }

  get haveData(): boolean {
    return true;
    // const sessionStorage = localStorage.getItem('wc@2:client:0.3//session');
    // const pairingStorage = localStorage.getItem('wc@2:core:0.3//pairing');
    // const subscriptionStorage = localStorage.getItem('wc@2:core:0.3//subscription');
    // const sessions: Array<unknown> = sessionStorage ? (JSON.parse(sessionStorage) as Array<unknown>) : [];
    // const pairings: Array<unknown> = pairingStorage ? (JSON.parse(pairingStorage) as Array<unknown>) : [];
    // const subscriptions: Array<unknown> = subscriptionStorage
    //   ? (JSON.parse(subscriptionStorage) as Array<unknown>)
    //   : [];
    // return !!sessions.length || !!pairings.length || !!subscriptions.length;
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

  public async initClient() {
    this.client = await WalletConnect.init({
      ...DEFAULT_WALLET_CONNECT_OPTIONS,
      storage: new WalletConnectStorage(),
    });
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
    if (!this.haveData) {
      await this.initClient();
    }

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

      const chainInfoMap = this.state.getNetworkMap;

      const [requestNamespace] = chainId.split(':');

      if (!namespaces.includes(requestNamespace)) {
        throw Error(getSdkError('UNSUPPORTED_NAMESPACE_KEY').message);
      }

      if (!chains.includes(chainId)) {
        throw Error(getSdkError('UNSUPPORTED_CHAINS').message + ' ' + chainId);
      }

      if (!isSupportWalletConnectChain(chainId, chainInfoMap)) {
        throw Error(getSdkError('UNSUPPORTED_CHAINS').message + ' ' + chainId);
      }

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
          // this.eip155RequestHandler.handleRequest(requestEvent);
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
        topic: topic,
        response: formatJsonRpcError(id, (e as Error).message),
      }).catch(console.error);
    }
  }

  createListener() {
    this.client?.on('session_proposal', this.onSessionProposal.bind(this));
    this.client?.on('session_request', this.onSessionRequest.bind(this));
    this.client?.on('session_ping', (data) => console.info('ping', data));
    this.client?.on('session_event', (data) => console.info('event', data));
    this.client?.on('session_update', (data) => console.info('update', data));
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
    this.checkClient();

    ALL_WALLET_CONNECT_EVENT.forEach((event) => {
      this.client?.removeAllListeners(event);
    });
  }
}
