import UniversalProvider from '@walletconnect/universal-provider';
import { getInternalError } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import { createSubscription } from '@extension-base/background/handlers/subscriptions';
import {
  DEFAULT_LOGGER,
  PROJECT_ID_EXTENSION,
  WALLET_CONNECT_DAPP_CONFIG,
  WALLET_CONNECT_METADATA,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
} from '@extension-base/services/wallet-connect-service/consts';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
import { generateHalfGenesisHash } from '@extension-base/services/wallet-connect-service/utils';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type State from '@extension-base/background/handlers/State';
import type { SessionTypes } from '@walletconnect/types';
import type { AppSessionInitResponse, PairingSubjectType } from '@extension-base/services/wallet-connect-service/types';
import type { Port } from '@extension-base/background/types/types';

export default class WalletConnectDAppService {
  state: State;
  private optionalNamespaces: Record<string, unknown>;
  private app?: UniversalProvider;

  public readonly uriSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public readonly pairingSubject: BehaviorSubject<Record<string, AppSessionInitResponse>> = new BehaviorSubject<
    Record<string, AppSessionInitResponse>
  >({});

  constructor(state: State) {
    this.state = state;
    this.initApp().catch(console.error);
    this.optionalNamespaces = {
      optionalNamespaces: {
        polkadot: {
          methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
          chains: [
            ...Object.values(this.state.networkMap).flatMap(({ isEthereum, genesisHash }) => {
              if (isEthereum) return [];

              return [`polkadot:${generateHalfGenesisHash(genesisHash)}`];
            }),
          ],
          events: ['chainChanged", "accountsChanged'],
        },
      },
    };
  }

  private async initApp() {
    this.app = await UniversalProvider.init({
      projectId: PROJECT_ID_EXTENSION,
      metadata: WALLET_CONNECT_METADATA,
      logger: DEFAULT_LOGGER,
      storage: new WalletConnectStorage(),
    });

    this.setListeners();
  }

  public get sessions(): SessionTypes.Struct[] {
    return this.app?.client.session.values || [];
  }

  private setListeners() {
    this.app?.client.pairing.core.on('pairing_expire', this.onSessionDelete);
    this.app?.client.on('session_delete', this.onSessionDelete);
  }

  checkClient() {
    if (!this.app) {
      throw new Error(getInternalError('NOT_INITIALIZED').message);
    }
  }

  private updatePairing(key: string, data: AppSessionInitResponse) {
    this.pairingSubject.next({ ...this.pairingSubject.value, [key]: data });
  }

  async initPairing() {
    if (!this.app) await this.initApp();

    const pairing = await this.app?.client.connect({ ...WALLET_CONNECT_DAPP_CONFIG, ...this.optionalNamespaces });

    this.setListeners();

    if (!pairing?.uri) throw new Error('uri error');
    this.updatePairing(pairing.uri, pairing);

    return pairing?.uri;
  }

  public async subscribePairing(uri: string, id: string, port: Port) {
    const cb = createSubscription<'pri(walletConnect.app.subscribePairing)'>(id, port);

    this.state.createUnsubscriptionHandle(id, () => {});

    port.onDisconnect.addListener((): void => {
      this.state.cancelSubscription(id);
    });

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
      .then((data) => this.onApproval(data, cb))
      .catch(() => cb({ status: false, message: 'rejected' }));

    return this.pairingSubject.value?.uri;
  }

  onApproval(data: SessionTypes.Struct, cb: (data: PairingSubjectType) => void) {
    const [, , address] = data.namespaces[WALLET_CONNECT_POLKADOT_NAMESPACE].accounts[0].split(':');
    const encodedAddress = this.state.keyringService.encodeAddress(address);

    if (!this.state.keyringService.getAllAccounts().some(({ address }) => address === encodedAddress)) {
      this.state.keyringService.saveAddress(
        encodedAddress,
        { name: data.peer.metadata.name, isMobile: true, wcTopic: data.topic },
        'address'
      );
      this.state.updateCurrentAccount(encodedAddress);

      cb({ status: true });
    } else {
      this.disconnect(data.topic);
      cb({
        status: false,
        message: 'duplicate',
      });
    }
  }

  disconnect(topic: string) {
    this.app?.client.core.pairing.disconnect({ topic });
  }

  abortPairingAttempt() {
    this.app?.abortPairingAttempt();
  }

  async onSessionDelete({ topic }: { id: number; topic: string }) {
    const account = this.state.keyringService.getAddresses().find((el) => el.meta.wcTopic === topic);

    if (account) {
      const current = await this.state.currentAccount;
      this.state.keyringService.forgetAddress(account?.address);

      if (current?.address === account.address) {
        const accounts = this.state.keyringService.getAccounts();
        this.state.updateCurrentAccount(accounts.length ? accounts[0].address : '');
      }
    }
  }

  onPairingExpire({ id, topic }: { id: string; topic: string }) {
    console.info(id, topic);
  }

  async onRequest(payload: SignerPayloadJSON) {
    const encodedAddress = this.state.keyringService.encodeAddress(payload.address);
    const account = this.state.keyringService.getAddress(encodedAddress);

    const request = {
      chainId: `polkadot:${generateHalfGenesisHash(payload.genesisHash)}`,
      topic: account?.meta.wcTopic as string,
      request: {
        method: 'polkadot_signTransaction',
        params: {
          address: payload.address,
          transactionPayload: payload,
        },
      },
    };
    const result = await this.app?.client
      .request<{ signature: HexString }>(request)

      .catch(() => {
        return { signature: '0x' as HexString };
      });

    return result as unknown as { signature: HexString };
  }

  async onRequestRaw(payload: SignerPayloadRaw) {
    const encodedAddress = this.state.keyringService.encodeAddress(payload.address);
    const account = this.state.keyringService.getAddress(encodedAddress);

    const result = await this.app?.client.request<{ signature: HexString }>({
      chainId: `polkadot:`,
      topic: account?.meta.wcTopic as string,
      request: {
        method: 'polkadot_signTransaction',
        params: {
          address: payload.address,
          transactionPayload: payload.data,
        },
      },
    });

    return result ?? { signature: '0x' as HexString };
  }
}
