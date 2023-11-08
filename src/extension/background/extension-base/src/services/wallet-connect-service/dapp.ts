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
import type State from '@extension-base/background/handlers/State';
import type { SessionTypes } from '@walletconnect/types';
import type { AppSessionInitResponse } from './dappTypes';
import type { Port } from '@extension-base/background/types/types';

export default class WalletConnectDAppService {
  state: State;
  private app: UniversalProvider | undefined;

  public readonly uriSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public readonly pairingSubject: BehaviorSubject<AppSessionInitResponse | undefined> = new BehaviorSubject<
    AppSessionInitResponse | undefined
  >(undefined);

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
    this.app?.client.on('session_ping', ({ id, topic }: { id: number; topic: string }) => {
      console.info('EVENT', 'session_ping');
      console.info(id, topic);
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

  async initPairing() {
    if (!this.app) {
      console.info('HAVE TO RECONECT');
      await this.initApp();
    }

    const pairing = await this.app?.client.connect(WALLET_CONNECT_DAPP_CONFIG);
    this.setListeners();

    this.pairingSubject.next(pairing);
  }

  public async subscribePairing(id: string, port: Port) {
    const cb = createSubscription<'pri(walletConnect.app.subscribePairing)'>(id, port);
    const pairingSubscription = this.pairingSubject.subscribe({
      next: (rs) => {
        cb(rs?.uri);
        rs?.approval().then((data: SessionTypes.Struct) => {
          console.info(this);
          this.onApproval(data);
        });
      },
    });

    this.state.createUnsubscriptionHandle(id, pairingSubscription.unsubscribe);

    port.onDisconnect.addListener((): void => {
      this.state.cancelSubscription(id);
    });

    await this.initPairing();

    return this.pairingSubject.value?.uri;
  }

  onApproval(data: SessionTypes.Struct) {
    console.info(data, 'PAYLOAD');
    const [, , address] = data.namespaces[WALLET_CONNECT_POLKADOT_NAMESPACE].accounts[0].split(':');
    const encodedAddress = this.state.keyringService.encodeAddress(address);
    console.info(address, this.state.keyringService.getAllAccounts());

    if (!this.state.keyringService.getAllAccounts().some(({ address }) => address === encodedAddress))
      this.state.keyringService.saveAddress(
        encodedAddress,
        { name: data.peer.metadata.name, isMobile: true },
        'address'
      );
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

  // onRequest() {
  //   this.app?.client.pairing.core.on('auth_request', ({ params }) => {
  //     if (params) {
  //       // Response contained a valid signature -> user is authenticated.
  //     } else {
  //       // Handle error or invalid signature case
  //       console.error(params);
  //     }
  //   });
  // }
}
