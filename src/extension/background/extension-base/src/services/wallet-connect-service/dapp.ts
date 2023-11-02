import UniversalProvider from '@walletconnect/universal-provider';
import { getInternalError } from '@walletconnect/utils';
import { SessionTypes } from '@walletconnect/types';
import { BehaviorSubject } from 'rxjs';
import { KeyringService } from '../keyring-service';
import { createSubscription } from '../../background/handlers/subscriptions';
import State from '../../background/handlers/State';
import { Port } from '../../background/types';

import {
  PROJECT_ID_EXTENSION,
  WALLET_CONNECT_DAPP_CONFIG,
  WALLET_CONNECT_METADATA,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
} from './consts';
import WalletConnectStorage from './storage';
import { AppSessionInitResponse } from './dappTypes';

export default class WalletConnectDAppService {
  keyringService: KeyringService;
  state: State;
  private app: UniversalProvider | undefined;

  public readonly uriSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public readonly pairingSubject: BehaviorSubject<AppSessionInitResponse | undefined> = new BehaviorSubject<
    AppSessionInitResponse | undefined
  >(undefined);

  constructor(keyringService: KeyringService, state: State) {
    this.keyringService = keyringService;
    this.state = state;
    this.initApp().catch(console.error);
  }

  private async initApp() {
    this.app = await UniversalProvider.init({
      projectId: PROJECT_ID_EXTENSION,
      metadata: WALLET_CONNECT_METADATA,
      storage: new WalletConnectStorage(),
    });
    this.app.on('auth_response', (data: unknown) => {
      console.info(data);
    });
    this.app.cleanupPendingPairings();
    this.setListeners();
  }

  public get sessions(): SessionTypes.Struct[] {
    return this.app?.client.session.values || [];
  }

  private setListeners() {
    // this.app?.client.pairing.core.on('pairing_expire', this.onPairingExpire);
    // this.app?.client.on('session_update', this.onSessionUpdate);
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
    this.pairingSubject.next(pairing);
  }

  public async subscribePairing(id: string, port: Port) {
    const cb = createSubscription<'pri(walletConnect.app.subscribePairing)'>(id, port);
    const pairingSubscription = this.pairingSubject.subscribe({
      next: (rs) => {
        cb(rs?.uri);
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
    const [, , address] = data.namespaces[WALLET_CONNECT_POLKADOT_NAMESPACE].accounts[0].split(':');
    const encodedAddress = this.keyringService.encodeAddress(address);

    if (this.keyringService.getAllAccounts().some(({ address }) => address === encodedAddress))
      this.keyringService.saveAddress(encodedAddress, { name: data.peer.metadata.name, isMobile: true }, 'address');
  }

  disconnect(topic: string) {
    this.app?.client.core.pairing.disconnect({ topic });
  }

  abortPairingAttempt() {
    this.app?.abortPairingAttempt();
  }

  onResponse(data: any) {
    console.info(data, 'PAIRING');
  }

  // onPairingDelete() {
  //   this.app?.client.pairing.core.on('pairing_delete', ({ id, topic }) => {
  //     console.log(id, topic);
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
