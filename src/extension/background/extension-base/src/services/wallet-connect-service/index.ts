import { formatJsonRpcError } from '@walletconnect/jsonrpc-utils';
import WalletConnect from '@walletconnect/sign-client';
import { getInternalError, getSdkError, isValidUrl } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import { storage } from '@extension-base/stores/Storage';
import { convertConnectRequest, convertNotSupportRequest } from '@extension-base/services/wallet-connect-service/utils';
import { type ResultApproveWalletConnectSession } from '@extension-base/services/wallet-connect-service/types';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
import WalletConnectRetiredSessions from '@extension-base/stores/WalletConnectRetiredSessions';
import {
  DEFAULT_WALLET_CONNECT_OPTIONS,
} from '@extension-base/services/wallet-connect-service/consts';
import { isSameAddress } from '@extension-base/utils';
import type State from '@extension-base/background/handlers/State';
import type { EngineTypes, SessionTypes, SignClientTypes } from '@walletconnect/types';
import type { RequestService } from '@extension-base/services';
import { PolkadotHandler } from '@/extension/background/extension-base/src/services/wallet-connect-service/requestHandlers/PolkadotHandler';
import { Eip155RequestHandler } from '@/extension/background/extension-base/src/services/wallet-connect-service/requestHandlers/Eip155Handler';
import { isSameString } from '@/helpers';

const namespaceAccounts = (namespace: SessionTypes.Namespace | unknown[]): string[] =>
  Array.isArray(namespace) ? [] : (namespace.accounts ?? []);

export class WalletConnectService {
  private client?: WalletConnect;
  private initialization?: Promise<void>;
  private readonly sessionRevisions = new Map<string, number>();
  private readonly retiredTopics = new Set<string>();
  private readonly expiredRequestIds = new Set<number>();

  isRequestExpired(id: number): boolean {
    return this.expiredRequestIds.has(id);
  }

  getSessionRevision(topic: string): number {
    return this.sessionRevisions.get(topic) ?? 0;
  }

  private sessionChanged(topic: string, retired = false): void {
    if (retired) this.retiredTopics.add(topic);
    this.sessionRevisions.set(topic, this.getSessionRevision(topic) + 1);
    this.updateSessions();
  }

  invalidateSession(topic: string): void {
    this.sessionChanged(topic, true);
  }

  private async retireSession(topic: string): Promise<void> {
    this.invalidateSession(topic);
    this.state?.walletConnectDappService?.invalidateSession(topic);
    await new WalletConnectRetiredSessions().retire(topic);
  }

  readonly eip155RequestHandler: Eip155RequestHandler;
  readonly polkadotRequestHandler: PolkadotHandler;
  readonly sessionSubject: BehaviorSubject<SessionTypes.Struct[]> = new BehaviorSubject<SessionTypes.Struct[]>([]);

  constructor(
    private state: State,
    private readonly requestService: RequestService
  ) {
    this.eip155RequestHandler = new Eip155RequestHandler(this.state, this);
    this.polkadotRequestHandler = new PolkadotHandler(this.state, this);

    this.initClient().catch(console.error);
  }

  get sessions() {
    return (this.client?.session.values || []).filter((session) => !this.retiredTopics.has(session.topic));
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



  private updateSessions() {
    this.sessionSubject.next(this.sessions);
  }

  getSession(key: string): SessionTypes.Struct {
    const session = this.client?.session.get(key);

    if (!session || this.retiredTopics.has(key)) {
      throw new Error(getInternalError('MISMATCHED_TOPIC').message);
    } else {
      return session;
    }
  }

  async initClient(force?: boolean) {
    if (this.client) return;
    if (!force && !(await this.haveData())) return;
    // The storage read above may yield while another caller initializes.
    if (this.client) return;
    if (!this.initialization) {
      this.initialization = new WalletConnectRetiredSessions().readTopics()
        .then((topics) => {
          topics.forEach((topic) => this.retiredTopics.add(topic));
          return WalletConnect.init({
            ...DEFAULT_WALLET_CONNECT_OPTIONS,
            storage: new WalletConnectStorage(),
          });
        })
        .then((client) => {
          this.client = client;
          this.updateSessions();
          this.createListener();
        })
        .finally(() => {
          this.initialization = undefined;
        });
    }
    await this.initialization;
  }

  public async responseRequest(response: EngineTypes.RespondParams) {
    this.checkClient();

    await this.client?.respond(response);
  }

  async connect(uri: string) {
    if (!isValidUrl(uri)) throw Error(getInternalError('MISSING_OR_INVALID').message);

    if (uri.match('@1')) throw Error(getInternalError('UNKNOWN_TYPE').message);

    await this.initClient(true);

    this.checkClient();

    return this.client?.pair({ uri });
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
    await this.retireSession(topic);
    await this.client?.disconnect({
      topic: topic,
      reason: getSdkError('USER_DISCONNECTED'),
    }).catch(console.error);

    this.updateSessions();
  }

  async removeSessions(address: string, ethereumAddress?: string): Promise<void> {
    await this.initClient();
    // Include locally retired SDK records: a prior failed storage write still
    // needs acknowledgement on retry before the account can be removed.
    const sessions = this.client?.session.values ?? [];
    await Promise.all(sessions.map(async (session) => {
      const ownsAccount = Object.entries(session.namespaces).some(([key, namespace]) =>
        namespaceAccounts(namespace).some((account) => {
          const [kind, , candidate] = account.split(':');
          if (!candidate || kind !== key.split(':')[0]) return false;
          if (kind === 'eip155') return !!ethereumAddress && isSameString(ethereumAddress, candidate);
          return kind === 'polkadot' && isSameAddress(address, candidate);
        })
      );
      if (ownsAccount) await this.disconnect(session.topic);
    }));
  }

  private onSessionProposal(proposal: SignClientTypes.EventArguments['session_proposal']) {
    this.checkClient();

    this.requestService.addConnectWCRequest(convertConnectRequest(proposal));
  }

  private onSessionRequest(requestEvent: SignClientTypes.EventArguments['session_request']) {
    this.checkClient();

    const { id, params, topic } = requestEvent;
    const { chainId } = params;
    try {
      // Each handler authorizes the current approved namespace. Proposal fields
      // cannot authorize signing, and receipt must not silently extend expiry.
      if (chainId.startsWith('eip155:')) this.eip155RequestHandler.handleRequest(requestEvent);
      else if (chainId.startsWith('polkadot:')) this.polkadotRequestHandler.handleRequest(requestEvent);
      else throw Error(getSdkError('UNSUPPORTED_NAMESPACE_KEY').message);
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

  private checkClient() {
    if (!this.client) {
      throw new Error(getInternalError('NOT_INITIALIZED').message);
    }
  }

  private createListener() {
    this.client?.on('session_proposal', (event) => this.onSessionProposal(event));
    this.client?.on('session_request', (event) => this.onSessionRequest(event));
    this.client?.on('session_request_expire', ({ id }) => this.expiredRequestIds.add(id));
    this.client?.on('session_delete', ({ topic }) => this.retireSession(topic).catch(console.error));
    this.client?.on('session_expire', ({ topic }) => this.retireSession(topic).catch(console.error));
    this.client?.on('session_ping', (data: unknown) => console.info('ping', data));
    this.client?.on('session_event', (data: unknown) => console.info('event', data));
    this.client?.on('session_update', ({ topic }) => this.sessionChanged(topic));
    this.client?.on('session_extend', ({ topic }) => this.sessionChanged(topic));
  }
}
