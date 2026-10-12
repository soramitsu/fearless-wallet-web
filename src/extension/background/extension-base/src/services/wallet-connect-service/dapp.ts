import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import { u8aToHex } from '@polkadot/util';
import { evmSigningAddress } from '@extension-base/services/request-service/handlers/evmSigningContext';
import { getInternalError, getSdkError } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import {
  PROJECT_ID_EXTENSION,
  SUBSTRATE_EVM_HALF_CHAIN_IDS,
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_METADATA,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
} from '@extension-base/services/wallet-connect-service/consts';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
import Provider from '@walletconnect/universal-provider';
import { EIP155_SIGNING_METHODS } from '@extension-base/services/wallet-connect-service/types';
import { isSameAddress } from '@extension-base/utils';
import { validateMobileSigningContext } from './mobileSigningContext';
import type { AppSessionInitResponse, PairingSubjectType } from '@extension-base/services/wallet-connect-service/types';
import type { EvmRequestParams } from '@extension-base/services/request-service/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { MobileSigningContext } from './mobileSigningContext';
import type State from '@extension-base/background/handlers/State';
import type { EngineTypes, SessionTypes } from '@walletconnect/types';
import type { Port, ResponseSigning } from '@extension-base/background/types/types';
import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';

export class WalletConnectDAppService {
  private app?: Provider;
  private initialization?: Promise<void>;
  private readonly sessionRevisions = new Map<string, number>();
  private readonly retiredTopics = new Set<string>();
  private readonly listenerClients = new WeakSet<object>();

  getSessionRevision(topic: string): number {
    return this.sessionRevisions.get(topic) ?? 0;
  }

  private sessionChanged(topic: string): void {
    this.sessionRevisions.set(topic, this.getSessionRevision(topic) + 1);
  }

  public readonly uriSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public readonly pairingSubject: BehaviorSubject<Record<string, AppSessionInitResponse>> = new BehaviorSubject<
    Record<string, AppSessionInitResponse>
  >({});

  constructor(private state: State) {
    this.initApp().catch(console.error);
  }

  private initApp(): Promise<void> {
    if (this.app) return Promise.resolve();
    if (!this.initialization) {
      this.initialization = Provider.init({
        projectId: PROJECT_ID_EXTENSION,
        metadata: WALLET_CONNECT_METADATA,
        logger: undefined,
        storage: new WalletConnectStorage(),
      })
        .then((app) => {
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
    return this.app?.client.session.values || [];
  }

  private setListeners() {
    const client = this.app?.client;
    if (!client || this.listenerClients.has(client)) return;
    this.listenerClients.add(client);
    client.on('session_update', ({ topic }) => this.sessionChanged(topic));
    client.on('session_extend', ({ topic }) => this.sessionChanged(topic));
    client.on('session_expire', ({ topic }) => this.onSessionDelete({ topic }));
    client.on('session_delete', ({ topic }) => this.onSessionDelete({ topic }));
  }

  checkClient() {
    if (!this.app) {
      throw new Error(getInternalError('NOT_INITIALIZED').message);
    }
  }

  private updatePairing(key: string, data: AppSessionInitResponse) {
    this.pairingSubject.next({ ...this.pairingSubject.value, [key]: data });
  }

  public getSession(topic: string): SessionTypes.Struct {
    const session = this.sessions.find((el) => el.topic === topic);

    if (!session || this.retiredTopics.has(topic)) {
      throw new Error(getInternalError('MISMATCHED_TOPIC').message);
    } else {
      return session;
    }
  }

  async initPairing() {
    if (!this.app) await this.initApp();

    const optionalChains = this.state.networkService.networksGithub.flatMap((network) => {
      if (isNativeEVMNetwork(network.name) || !network.chainId) return [];

      const halfChainId = network.chainId.slice(0, Math.ceil(network.chainId.length / 2));

      return [`polkadot:${halfChainId}`];
    });

    const optionalEvmChains = this.state.networkService.networksGithub.flatMap((network) => {
      if (!isNativeEVMNetwork(network.name) || !network.chainId) return [];

      const halfChainId = network.chainId.slice(0, Math.ceil(network.chainId.length / 2));

      return [`eip155:${halfChainId}`];
    });

    const pairing = await this.app?.client.connect({
      requiredNamespaces: {
        polkadot: {
          methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
          chains: [
            'polkadot:91b171bb158e2d3848fa23a9f1c25182', //dot
            'polkadot:7e4e32d0feafd4f9c9414b0be86373f9', //sora mainnet
          ],
          events: [],
        },
        eip155: {
          chains: ['eip155:1'],
          methods: ['personal_sign', 'eth_sendTransaction'],
          events: [],
        },
      },
      optionalNamespaces: {
        polkadot: {
          methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
          chains: optionalChains,
          events: [],
        },
        eip155: {
          chains: optionalEvmChains,
          methods: [
            'eth_sendTransaction',
            'personal_sign',
            'eth_sign',
            'eth_signTransaction',
            'eth_signTypedData',
            'eth_signTypedData_v1',
            'eth_signTypedData_v3',
            'eth_signTypedData_v4',
            'eth_sendRawTransaction',
          ],
          events: ['accountsChanged', 'chainChanged'],
        },
      },
    });

    if (!pairing?.uri) throw new Error('uri error');
    this.updatePairing(pairing.uri, pairing);

    return pairing?.uri;
  }

  public async subscribePairing(uri: string, id: string, port?: Port) {
    const cb = this.state.subscriptionService.createSubscription<'pri(walletConnect.app.subscribePairing)'>(id, port);

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => {});

    port?.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));

    const activePairing = this.pairingSubject.value[uri];

    if (!activePairing) {
      cb({
        status: false,
        message: 'ERROR',
      });

      return;
    }

    activePairing
      ?.approval()
      .then((data) => this.onAuthApproval(data, cb))
      .catch(() => cb({ status: false, message: 'rejected' }));

    return this.pairingSubject.value?.uri;
  }

  onAuthApproval(data: SessionTypes.Struct, cb: (data: PairingSubjectType) => void) {
    const accounts = data.namespaces[WALLET_CONNECT_POLKADOT_NAMESPACE].accounts;
    const substrateAddress = accounts.find((el) => {
      const [, chainId] = el.split(':');

      return !SUBSTRATE_EVM_HALF_CHAIN_IDS.includes(chainId);
    });

    if (!substrateAddress) throw new Error("couldn't find substrate address");

    const [, , address] = substrateAddress.split(':');
    const encodedAddress = this.state.keyringService.encodeAddress(address);
    const ethAddress = accounts.find((el) => {
      const [, chainId] = el.split(':');

      return SUBSTRATE_EVM_HALF_CHAIN_IDS.includes(chainId);
    });

    let ethereumAddressWC;

    if (ethAddress) {
      const [, , ethereumAddress] = ethAddress.split(':');

      ethereumAddressWC = ethereumAddress;
    }

    const availableSubstrateNetworks =
      data.namespaces[WALLET_CONNECT_POLKADOT_NAMESPACE].chains?.map((el) => el.split(':')[1]) ?? [];

    const availableEvmNetworks =
      data.namespaces[WALLET_CONNECT_EIP155_NAMESPACE].chains?.map((el) => el.split(':')[1]) ?? [];

    const isDuplicate = this.state.keyringService.getAllAccounts().some(({ address }) => address === encodedAddress);

    if (isDuplicate) {
      this.disconnect(data.topic);
      cb({
        status: false,
        message: 'duplicate',
      });

      return;
    }

    this.state.keyringService.saveAddress(
      encodedAddress,
      {
        name: data.peer.metadata.name,
        isMobile: true,
        wcTopic: data.topic,
        ethereumAddress: ethereumAddressWC,
        chains: [...availableSubstrateNetworks, ...availableEvmNetworks],
      },
      'address'
    );
    this.state.updateCurrentAccount({ address: encodedAddress });

    cb({ status: true });
  }

  disconnect(topic: string) {
    this.retiredTopics.add(topic);
    this.sessionChanged(topic);
    this.app?.client.disconnect({ topic, reason: getSdkError('USER_DISCONNECTED') }).catch(console.error);
  }

  availableNetworks(address: string) {
    const pairing = this.state.keyringService.getAddress(address);
    if (!pairing) return [];

    const session = this.sessions.find((session) => session.topic === pairing.meta.wcTopic);

    if (session) return session.namespaces['polkadot'].chains?.map((chain) => chain.split(':')[1]) ?? [];

    return [];
  }

  abortPairingAttempt() {
    this.app?.abortPairingAttempt();
  }

  async onSessionDelete({ topic }: { topic: string }) {
    this.retiredTopics.add(topic);
    this.sessionChanged(topic);
    const account = this.state.keyringService.getAddresses().find((el) => el.meta.wcTopic === topic);

    if (account) {
      this.state.keyringService.forgetAddress(account?.address);

      if (this.state.currentAccount?.address === account.address) {
        const accounts = this.state.keyringService.getAllSubstrateAccounts();

        if (accounts.length) this.state.updateCurrentAccount({ address: accounts[0].address });
        else this.state.setCurrentAccount(null);
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
