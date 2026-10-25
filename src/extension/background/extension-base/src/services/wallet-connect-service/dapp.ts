import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import { u8aToHex } from '@polkadot/util';
import { evmSigningAddress } from '@extension-base/services/request-service/handlers/evmSigningContext';
import { getInternalError, getSdkError } from '@walletconnect/utils';
import { PROJECT_ID_EXTENSION, WALLET_CONNECT_METADATA } from '@extension-base/services/wallet-connect-service/consts';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
import WalletConnectRetiredSessions from '@extension-base/stores/WalletConnectRetiredSessions';
import { walletAddressIdentity } from '@extension-base/services/keyring-service/DeletedWallets';
import Provider from '@walletconnect/universal-provider';
import { EIP155_SIGNING_METHODS } from '@extension-base/services/wallet-connect-service/types';
import { isSameAddress } from '@extension-base/utils';
import { sessionAuthority } from './sessionAuthority';
import { validateMobileSigningContext } from './mobileSigningContext';
import { captureMobilePairingAccount, mobilePairingProposal, sameMobileIdentity } from './pairingContext';
import type { PairingSubjectType } from '@extension-base/services/wallet-connect-service/types';
import type { EvmRequestParams } from '@extension-base/services/request-service/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { MobileSigningContext } from './mobileSigningContext';
import type State from '@extension-base/background/handlers/State';
import type { EngineTypes, SessionTypes } from '@walletconnect/types';
import type { Port, ResponseSigning } from '@extension-base/background/types/types';

type PairingAttempt = {
  id: string;
  port?: Port;
  active: boolean;
  completing?: boolean;
  persistingTopic?: string;
  retirement?: Promise<void>;
  selection?: Promise<boolean>;
  uri?: string;
  session?: SessionTypes.Struct;
  priorTopics: Set<string>;
  currentAddress?: string;
  currentAccountRevision: number;
  authorityRevision: number;
  subscriber?: { id: string; callback: (data: PairingSubjectType) => void };
  disconnectListener: () => void;
};

export class WalletConnectDAppService {
  private app?: Provider;
  private initialization?: Promise<void>;
  private readonly sessionRevisions = new Map<string, number>();
  private readonly retiredTopics = new Set<string>();
  private readonly listenerClients = new WeakSet<object>();

  private get authority() { return sessionAuthority(this.state); }

  getSessionRevision(topic: string): number {
    return (this.sessionRevisions.get(topic) ?? 0) + this.authority.revision;
  }

  private sessionChanged(topic: string): void {
    this.sessionRevisions.set(topic, (this.sessionRevisions.get(topic) ?? 0) + 1);
  }

  invalidateSession(topic: string): void {
    this.retiredTopics.add(topic);
    this.sessionChanged(topic);
  }

  private readonly pairingAttempts = new Map<string, PairingAttempt>();
  private readonly usedPairingIds = new Set<string>();

  constructor(private state: State) {
    this.initApp().catch(console.error);
  }

  private initApp(): Promise<void> {
    if (this.app) return Promise.resolve();
    if (!this.initialization) {
      this.initialization = this.authority.load()
        .then(() => {
          return Provider.init({
            projectId: PROJECT_ID_EXTENSION,
            metadata: WALLET_CONNECT_METADATA,
            logger: undefined,
            storage: new WalletConnectStorage(),
          });
        })
        .then(async (app) => {
          await this.authority.load();
          this.app = app;
          this.setListeners();
        })
        .finally(() => {
          this.initialization = undefined;
        });
    }
    return this.initialization;
  }

  public get sessions(): SessionTypes.Struct[] {
    return (this.app?.client.session.values || []).filter((session) => !this.retiredTopics.has(session.topic) && this.authority.allows(session.topic));
  }

  private setListeners() {
    const client = this.app?.client;
    if (!client || this.listenerClients.has(client)) return;
    this.listenerClients.add(client);
    client.on('session_update', ({ topic }) => this.sessionChanged(topic));
    client.on('session_extend', ({ topic }) => this.sessionChanged(topic));
    client.on('session_expire', ({ topic }) => this.onSessionDelete({ topic }).catch(console.error));
    client.on('session_delete', ({ topic }) => this.onSessionDelete({ topic }).catch(console.error));
  }

  checkClient() {
    if (!this.app) {
      throw new Error(getInternalError('NOT_INITIALIZED').message);
    }
  }

  public getSession(topic: string): SessionTypes.Struct {
    if (this.state.keyringService.isResetting) throw new Error('Wallet reset is in progress');
    const session = this.sessions.find((el) => el.topic === topic);

    if (!session || this.retiredTopics.has(topic)) {
      throw new Error(getInternalError('MISMATCHED_TOPIC').message);
    } else {
      return session;
    }
  }

  async initPairing(id: string, port?: Port): Promise<string> {
    if (this.state.keyringService.isResetting) throw new Error('Wallet reset is in progress');
    if (typeof id !== 'string' || !id || id.length > 128 || this.usedPairingIds.has(id))
      throw new Error('Invalid or reused mobile pairing attempt');
    this.usedPairingIds.add(id);
    const attempt: PairingAttempt = {
      id,
      port,
      active: true,
      priorTopics: new Set(),
      currentAddress: this.state.currentAccount?.address,
      currentAccountRevision: this.state.keyringService.currentAccountRevision,
      authorityRevision: this.authority.revision,
      disconnectListener: () => { void this.abortPairingAttempt(id, port).catch(console.error); },
    };
    this.pairingAttempts.set(id, attempt);
    port?.onDisconnect.addListener(attempt.disconnectListener);
    try {
      await this.initApp();
      if (!attempt.active) throw new Error('Mobile pairing was cancelled');
      attempt.priorTopics = new Set((this.app?.client.session.values ?? []).map((session) => session.topic));
      const pairing = await this.app!.client.connect(mobilePairingProposal(this.state.networkService.networkValues));
      // Observe exactly once, including a late approval after cancellation.
      pairing
        .approval()
        .then(async (session) => {
          attempt.session = structuredClone(session);
          if (!attempt.active) await this.discardPairingSession(attempt);
          else await this.completePairing(attempt);
        })
        .catch(() => this.finishPairing(attempt, { status: false, message: 'rejected' }))
        .catch(console.error);
      if (!attempt.active) throw new Error('Mobile pairing was cancelled');
      if (
        !pairing.uri ||
        [...this.pairingAttempts.values()].some((other) => other !== attempt && other.uri === pairing.uri)
      )
        throw new Error('Mobile pairing URI is unavailable');
      attempt.uri = pairing.uri;
      return pairing.uri;
    } catch (error) {
      await this.finishPairing(attempt);
      throw error;
    }
  }

  public async subscribePairing(uri: string, id: string, port?: Port): Promise<PairingSubjectType> {
    const callback = this.state.subscriptionService.createSubscription<'pri(walletConnect.app.subscribePairing)'>(
      id,
      port
    );
    const attempt = [...this.pairingAttempts.values()].find(
      (entry) => entry.active && entry.uri === uri && entry.port === port
    );
    if (!attempt || attempt.subscriber) {
      const result = { status: false, message: 'unavailable' };
      callback(result);
      this.state.subscriptionService.cancelSubscription(id);
      return result;
    }
    attempt.subscriber = { id, callback };
    this.state.subscriptionService.setUnsubscriptionHandle(id, () => {
      void this.abortPairingAttempt(attempt.id, port).catch(console.error);
    });
    void this.completePairing(attempt).catch(console.error);
    return { uri };
  }

  private async discardPairingSession(attempt: PairingAttempt): Promise<void> {
    const topic = attempt.session?.topic;
    // A rejected attempt cannot disconnect an already imported/previous session.
    // Its own submitted write may have published before a late cancellation check.
    if (
      !topic ||
      attempt.priorTopics.has(topic) ||
      (attempt.persistingTopic !== topic &&
        this.state.keyringService.getAllAccounts().some((account) => account.meta.wcTopic === topic))
    )
      return;
    await this.disconnect(topic);
  }

  private finishPairing(attempt: PairingAttempt, result?: PairingSubjectType): Promise<void> {
    if (attempt.retirement) return attempt.retirement;
    const wasActive = attempt.active;
    attempt.active = false;
    // Keep a failed retirement available for an explicit cancellation retry.
    // Set this before cancelSubscription, whose callback can re-enter here.
    attempt.retirement = (result?.status ? Promise.resolve() : (async () => {
      await this.discardPairingSession(attempt);
      if (attempt.selection) {
        await attempt.selection.catch(() => {});
        await this.state.keyringService.settleCurrentAccount();
      }
    })())
      .then(() => { this.pairingAttempts.delete(attempt.id); })
      .finally(() => { attempt.retirement = undefined; });
    if (wasActive) {
      attempt.port?.onDisconnect.removeListener(attempt.disconnectListener);
      if (attempt.subscriber) {
        if (result) attempt.subscriber.callback(result);
        this.state.subscriptionService.cancelSubscription(attempt.subscriber.id);
      }
    }
    return attempt.retirement;
  }

  private async completePairing(attempt: PairingAttempt): Promise<void> {
    if (!attempt.active || !attempt.session || !attempt.subscriber || attempt.completing) return;
    attempt.completing = true;
    let duplicate = false;
    try {
      const session = attempt.session;
      const revision = this.getSessionRevision(session.topic);
      // A fresh approved candidate is validated against its exact live SDK
      // envelope without making it available to general signing callers.
      const reader = {
        getSessionRevision: (topic: string) => this.getSessionRevision(topic),
        getSession: (topic: string): SessionTypes.Struct => {
          const live = this.app?.client.session.values.find(value => value.topic === topic);
          if (!live || topic !== session.topic || !attempt.active || this.retiredTopics.has(topic) ||
            this.state.keyringService.isResetting || this.authority.revision !== attempt.authorityRevision)
            throw new Error('Mobile pairing context changed');
          return live;
        },
      };
      const assertSession = () => {
        if (!attempt.active || attempt.priorTopics.has(session.topic) || this.getSessionRevision(session.topic) !== revision)
          throw new Error('Mobile pairing context changed');
        captureMobilePairingAccount(reader, session);
      };
      const assertCurrent = () => {
        assertSession();
        if (this.state.currentAccount?.address !== attempt.currentAddress ||
          this.state.keyringService.currentAccountRevision !== attempt.currentAccountRevision)
          throw new Error('Mobile pairing selection changed');
      };
      assertCurrent();
      const account = captureMobilePairingAccount(reader, session);
      const encodedAddress = this.state.keyringService.encodeAddress(account.address);
      const isDuplicate = () => this.state.keyringService
        .getAllAccounts()
        .some(
          (existing) =>
            sameMobileIdentity(existing.address, encodedAddress) ||
            (account.ethereumAddress &&
              [existing.address, existing.meta.ethereumAddress].some(
                (address) => typeof address === 'string' && sameMobileIdentity(address, account.ethereumAddress)
              ))
        );
      if (isDuplicate()) {
        await this.finishPairing(attempt, { status: false, message: 'duplicate' });
        return;
      }
      await this.state.keyringService.saveAddress(
        encodedAddress,
        {
          name: account.name,
          isMobile: true,
          wcTopic: session.topic,
          ethereumAddress: account.ethereumAddress,
          chains: account.chains,
        },
        'address',
        {
          requireAbsent: true,
          assertCurrent: () => {
            assertCurrent();
            duplicate = !!isDuplicate();
            if (duplicate) throw new Error('Mobile account already exists.');
            attempt.persistingTopic = session.topic;
          },
        }
      );
      // A submitted public record can outlive cancellation; retain it, retire its
      // session and refuse late selection/success instead of blindly deleting it.
      assertCurrent();
      await this.authority.approve(session.topic, assertCurrent);
      assertCurrent();
      attempt.selection = this.state.updateCurrentAccount({ address: encodedAddress }, true, {
        assertCurrent: assertSession,
        onCommitted: () => { void this.finishPairing(attempt, { status: true }).catch(console.error); },
      });
      await attempt.selection;
    } catch {
      await this.finishPairing(attempt, { status: false, message: duplicate ? 'duplicate' : 'unavailable' });
    }
  }

  async disconnect(topic: string): Promise<void> {
    this.invalidateSession(topic);
    this.state?.walletConnectService?.invalidateSession(topic);
    await new WalletConnectRetiredSessions().retire(topic);
    // The persisted local veto is the acknowledgement. Relay cleanup may stay
    // pending offline and must not hold cancellation, selection repair or reset.
    void Promise.resolve().then(() => this.app?.client.disconnect({ topic, reason: getSdkError('USER_DISCONNECTED') }))
      .catch(console.error);
  }

  async resetWallet(): Promise<void> {
    // finishPairing marks attempts inactive synchronously, including attempts
    // whose SDK approval is still pending. Their late sessions are retired by
    // the existing completion path and cannot publish an account or selection.
    const topics = [...new Set([
      ...(this.app?.client.session.values ?? []).map((session) => session.topic),
      ...this.state.keyringService.getAllAccounts().flatMap(({ meta }) =>
        typeof meta.wcTopic === 'string' && meta.wcTopic ? [meta.wcTopic] : []),
    ])];
    for (const topic of topics) {
      this.invalidateSession(topic);
      this.state.walletConnectService?.invalidateSession(topic);
    }
    const retirement = this.authority.reset(topics);
    await Promise.all([retirement, ...[...this.pairingAttempts.values()].map(attempt => this.finishPairing(attempt))]);
    // Durable local retirement is authoritative even while the relay is offline.
    for (const topic of topics)
      void this.app?.client.disconnect({ topic, reason: getSdkError('USER_DISCONNECTED') }).catch(console.error);
  }

  availableNetworks(address: string) {
    const pairing = this.state.keyringService.getAddress(address);
    if (!pairing || typeof pairing.meta.wcTopic !== 'string') return [];
    try {
      const account = captureMobilePairingAccount(this, this.getSession(pairing.meta.wcTopic));
      if (
        !sameMobileIdentity(address, account.address) ||
        account.ethereumAddress !==
          (typeof pairing.meta.ethereumAddress === 'string' ? pairing.meta.ethereumAddress.toLowerCase() : undefined)
      )
        return [];
      return account.chains;
    } catch {
      return [];
    }
  }

  async abortPairingAttempt(id: string, port?: Port): Promise<boolean> {
    const attempt = this.pairingAttempts.get(id);
    if (attempt?.port === port && attempt) await this.finishPairing(attempt);
    return true;
  }

  async onSessionDelete({ topic }: { topic: string }) {
    this.invalidateSession(topic);
    this.state?.walletConnectService?.invalidateSession(topic);
    await new WalletConnectRetiredSessions().retire(topic);
    // Whole reset owns the vault queue and the final account snapshot. Let it
    // remove public records, without a reentrant deletion or fallback selection.
    if (this.state.keyringService.isResetting) return;
    const account = this.state.keyringService.getAddresses().find((el) => el.meta.wcTopic === topic);

    if (account) {
      let clearedRevision: number | undefined;
      const assertCurrent = () => {
        if (this.state.keyringService.getAddress(account.address)?.meta.wcTopic !== topic)
          throw new Error('Mobile wallet session changed during removal.');
      };
      await this.state.keyringService.forgetAddress(account.address, async () => {
        assertCurrent();
        const selected = this.state.currentAccount?.address;
        if (!selected || walletAddressIdentity(selected) !== walletAddressIdentity(account.address)) return;
        await this.state.setCurrentAccount(null, undefined, assertCurrent);
        clearedRevision = this.state.keyringService.currentAccountRevision;
      }, assertCurrent);

      if (clearedRevision !== undefined && !this.state.currentAccount &&
        this.state.keyringService.currentAccountRevision === clearedRevision) {
        const accounts = this.state.keyringService.getAllSubstrateAccounts();

        if (accounts.length) await this.state.updateCurrentAccount({ address: accounts[0].address });
      }

      this.state.cleanupDeletedAccount(account.address);
    }
  }

  async onRequest(
    payload: SignerPayloadJSON | SignerPayloadRaw,
    context: MobileSigningContext,
    assertCurrent: () => void
  ): Promise<{ signature: HexString }> {
    const snapshot = structuredClone(payload);
    const extrinsic = 'genesisHash' in snapshot;
    const intent = {
      topic: context?.topic,
      address: snapshot.address,
      method: extrinsic ? 'polkadot_signTransaction' : 'polkadot_signMessage',
      ...(extrinsic ? { chainId: `polkadot:${snapshot.genesisHash.slice(2, 34).toLowerCase()}` } : {}),
    };
    const validate = () => {
      assertCurrent();
      validateMobileSigningContext(this, context, intent);
    };
    validate();
    if (!this.app) throw new Error('Wallet Connect is not init!');
    const result = await this.app.client.request<{ signature: HexString }>({
      chainId: context.chainId,
      topic: context.topic,
      request: {
        method: intent.method,
        params: extrinsic
          ? { address: snapshot.address, transactionPayload: snapshot }
          : { address: snapshot.address, message: u8aToHex(wrapBytes(snapshot.data)) },
      },
    });
    validate();
    if (!result || typeof result.signature !== 'string') throw new Error('Invalid mobile Substrate response');
    return result;
  }

  public async onEvmRequest(
    id: string,
    method: string,
    params: EvmRequestParams,
    context: MobileSigningContext,
    assertCurrent: () => void
  ): Promise<ResponseSigning> {
    const snapshot = structuredClone(params);
    const intent = {
      topic: context?.topic,
      chainId: context?.chainId,
      method,
      address: evmSigningAddress(method, snapshot),
    };
    const validate = () => {
      assertCurrent();
      validateMobileSigningContext(this, context, intent);
    };
    validate();
    const requestEvent: EngineTypes.RequestParams = {
      chainId: context.chainId,
      topic: context.topic,
      request: { method, params: snapshot },
    };

    if (!this.app) throw new Error('Wallet Connect is not init!');
    const result = await this.app.client.request<unknown>(requestEvent);
    validate();
    // EIP-155 WalletConnect responses are the raw signature / transaction hash,
    // not an object with a payload field.
    if (
      typeof result !== 'string' ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(result) ||
      (method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION && result.length !== 66)
    ) {
      throw new Error('Invalid EVM response from the mobile wallet');
    }
    return { id, payload: result as HexString };
  }

  checkAccount(address: string, accounts: string[]) {
    if (!accounts.find((account) => isSameAddress(account, address))) {
      throw new Error(getSdkError('UNSUPPORTED_ACCOUNTS').message + ' ' + address);
    }
  }
}
