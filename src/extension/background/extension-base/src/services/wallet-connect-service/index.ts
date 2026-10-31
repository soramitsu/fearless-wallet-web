import { isEthereumAddress } from '@polkadot/util-crypto';
import { formatJsonRpcError } from '@walletconnect/jsonrpc-utils';
import WalletConnect from '@walletconnect/sign-client';
import { getInternalError, getSdkError, isValidUrl } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import { convertConnectRequest, convertNotSupportRequest } from '@extension-base/services/wallet-connect-service/utils';
import { type ResultApproveWalletConnectSession } from '@extension-base/services/wallet-connect-service/types';
import WalletConnectStorage, { hasWalletConnectData } from '@extension-base/services/wallet-connect-service/storage';
import WalletConnectRetiredSessions from '@extension-base/stores/WalletConnectRetiredSessions';
import {
  DEFAULT_WALLET_CONNECT_OPTIONS,
} from '@extension-base/services/wallet-connect-service/consts';
import { isSameAddress } from '@extension-base/utils';
import { sessionAuthority } from './sessionAuthority';
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

  private get authority() { return sessionAuthority(this.state); }

  getSessionRevision(topic: string): number {
    return (this.sessionRevisions.get(topic) ?? 0) + this.authority.revision;
  }

  private sessionChanged(topic: string, retired = false): void {
    if (retired) this.retiredTopics.add(topic);
    this.sessionRevisions.set(topic, (this.sessionRevisions.get(topic) ?? 0) + 1);
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
    return (this.client?.session.values || []).filter((session) => !this.retiredTopics.has(session.topic) && this.authority.allows(session.topic));
  }

  private updateSessions() {
    this.sessionSubject.next(this.sessions);
  }

  getSession(key: string): SessionTypes.Struct {
    if (this.state.keyringService.isResetting) throw new Error('Wallet reset is in progress');
    const session = this.client?.session.get(key);

    if (!session || this.retiredTopics.has(key) || !this.authority.allows(key)) {
      throw new Error(getInternalError('MISMATCHED_TOPIC').message);
    } else {
      return session;
    }
  }

  async initClient(force?: boolean) {
    if (this.client) return;
    if (!force && !(await hasWalletConnectData())) return;
    // The storage read above may yield while another caller initializes.
    if (this.client) return;
    if (!this.initialization) {
      this.initialization = this.authority.load()
        .then(() => {
          return WalletConnect.init({
            ...DEFAULT_WALLET_CONNECT_OPTIONS,
            storage: new WalletConnectStorage(),
          });
        })
        .then(async (client) => {
          await this.authority.load();
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
    const resetRevision = this.state.keyringService.walletResetRevision;
    if (this.state.keyringService.isResetting) throw new Error('Wallet reset is in progress');
    if (!isValidUrl(uri)) throw Error(getInternalError('MISSING_OR_INVALID').message);

    if (uri.match('@1')) throw Error(getInternalError('UNKNOWN_TYPE').message);

    await this.initClient(true);
    if (this.state.keyringService.isResetting || this.state.keyringService.walletResetRevision !== resetRevision)
      throw new Error('Wallet changed during connection');

    this.checkClient();

    return this.client?.pair({ uri });
  }

  async approveSession(result: ResultApproveWalletConnectSession) {
    const resetRevision = this.state.keyringService.walletResetRevision;
    if (this.state.keyringService.isResetting) throw new Error('Wallet reset is in progress');
    this.checkClient();
    const authorityRevision = this.authority.revision;
    const assertCurrent = () => {
      if (this.state.keyringService.isResetting || this.state.keyringService.walletResetRevision !== resetRevision ||
        this.authority.revision !== authorityRevision) throw new Error('Wallet changed during session approval');
    };
    const approved = await this.client!.approve(result);
    try {
      await this.authority.approve(approved.topic, assertCurrent);
    } catch (error) {
      await this.retireSession(approved.topic);
      void this.client!.disconnect({ topic: approved.topic, reason: getSdkError('USER_DISCONNECTED') }).catch(console.error);
      throw error;
    }

    this.updateSessions();
  }

  async rejectSession(id: number) {
    this.checkClient();

    await this.client?.reject({ id, reason: getSdkError('USER_REJECTED') });
  }

  async disconnect(topic: string) {
    await this.retireSession(topic);
    // Local retirement is already durable; an offline relay cannot delay reset
    // or removal of the account that owned this session.
    void Promise.resolve().then(() => this.client?.disconnect({
      topic,
      reason: getSdkError('USER_DISCONNECTED'),
    })).catch(console.error);

    this.updateSessions();
  }

  async resetWallet(): Promise<void> {
    const topics = (this.client?.session.values ?? []).map((session) => session.topic);
    const retirement = this.authority.reset(topics);
    for (const topic of topics) {
      this.invalidateSession(topic);
      this.state?.walletConnectDappService?.invalidateSession(topic);
    }
    await retirement;
    for (const topic of topics)
      void this.client?.disconnect({ topic, reason: getSdkError('USER_DISCONNECTED') }).catch(console.error);
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
          if (kind === 'eip155') return (isEthereumAddress(address) && isSameString(address, candidate)) ||
            (!!ethereumAddress && isSameString(ethereumAddress, candidate));
          return kind === 'polkadot' && isSameAddress(address, candidate);
        })
      );
      if (ownsAccount) await this.disconnect(session.topic);
    }));
  }

  private onSessionProposal(proposal: SignClientTypes.EventArguments['session_proposal']) {
    this.checkClient();
    if (this.state.keyringService.isResetting) {
      void this.rejectSession(proposal.id).catch(console.error);
      return;
    }

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
