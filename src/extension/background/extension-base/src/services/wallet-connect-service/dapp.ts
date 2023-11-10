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
import { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import { HexString } from '@polkadot/util/types';
import { generateHalfGenesisHash } from './utils';
import type State from '@extension-base/background/handlers/State';
import type { SessionTypes } from '@walletconnect/types';
import type {
  AppSessionInitResponse,
  PairingSubjectType,
} from '@extension-base/services/wallet-connect-service/dappTypes';
import type { Port } from '@extension-base/background/types/types';

export default class WalletConnectDAppService {
  state: State;
  private app?: UniversalProvider;

  public readonly uriSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public readonly pairingSubject: BehaviorSubject<Record<string, AppSessionInitResponse>> = new BehaviorSubject<
    Record<string, AppSessionInitResponse>
  >({});

  constructor(state: State) {
    this.state = state;
    this.initApp().catch(console.error);
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
    this.app?.client.pairing.core.on('pairing_expire', this.onPairingExpire);
    this.app?.client.on('session_update', this.onSessionUpdate);
    this.app?.client.on('session_event', (data: any) => {
      console.info(data, 'session_event');
    });
    this.app?.client.on('session_delete', ({ id, topic }: { id: number; topic: string }) => {
      console.info('EVENT', 'session_deleted');
      console.info(id, topic);
    });
  }
  updateSessions() {
    // this.sessionSubject.next(this.sessions);
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

    const pairing = await this.app?.client.connect(WALLET_CONNECT_DAPP_CONFIG);

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
    if (!activePairing)
      cb({
        status: false,
        message: 'ERROR',
      });

    activePairing
      ?.approval()
      .then((data) => {
        this.onApproval(data, cb);
      })
      .catch(() => {
        //TODO
      });

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

      cb({
        status: true,
        message: 'all set up',
      });
    } else {
      cb({
        status: false,
        message: 'already has this wallet',
      });
    }
  }

  disconnect(topic: string) {
    this.app?.client.core.pairing.disconnect({ topic });
  }

  abortPairingAttempt() {
    this.app?.abortPairingAttempt();
  }

  onResponse() {
    // console.info(data, 'PAIRING');
  }

  // onPairingDelete() {
  //   this.app?.client.pairing.core.on('pairing_delete', ({ id, topic }) => {
  //     console.info(id, topic);
  //     // clean up after the pairing for `topic` was deleted.
  //   });
  // }

  onPairingExpire({ id, topic }: { id: string; topic: string }) {
    console.info(id, topic);
  }

  onSessionUpdate({
    id,
    topic,
    params,
  }: {
    id: number;
    topic: string;
    params: { namespaces: SessionTypes.Namespaces };
  }) {
    console.info(id, topic, params);
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

    return result as any as { signature: HexString };
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
