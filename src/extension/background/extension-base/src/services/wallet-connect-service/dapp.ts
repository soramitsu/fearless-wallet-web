import UniversalProvider from '@walletconnect/universal-provider';
import { PROJECT_ID_EXTENSION, WALLET_CONNECT_DAPP_CONFIG, WALLET_CONNECT_METADATA } from './consts';
import WalletConnectStorage from './storage';

export default class WalletConnectDAppService {
  private app: UniversalProvider | undefined;
  constructor() {
    this.initApp().catch(console.error);
  }

  private async initApp() {
    this.app = await UniversalProvider.init({
      projectId: PROJECT_ID_EXTENSION,
      metadata: WALLET_CONNECT_METADATA,
      storage: new WalletConnectStorage(),
    });
  }

  async initSession(): Promise<string> {
    if (!this.app) throw new Error('App client not init');

    const { uri } = await this.app.client.connect(WALLET_CONNECT_DAPP_CONFIG);

    if (!uri) throw new Error('uri is undefined');

    return uri;
  }

  // disconnect(topic: string) {
  // this.app?.client.disconnect({ topic });
  // }

  // onResponse() {
  //   this.app?.on('auth_response', ({ params }) => {
  //     if (params) {
  //       // Response contained a valid signature -> user is authenticated.
  //     } else {
  //       // Handle error or invalid signature case
  //       console.error(params);
  //     }
  //   });
  // }
  // onPairingDelete() {
  //   this.app?.client.pairing.core.on('pairing_delete', ({ id, topic }) => {
  //     console.log(id, topic);
  //     // clean up after the pairing for `topic` was deleted.
  //   });
  // }
  // onPairingExpire() {
  //   this.app?.client.pairing.core.on('pairing_expire', ({ id, topic }) => {
  //     console.log(id, topic);
  //     // clean up after the pairing for `topic` was deleted.
  //   });
  // }
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
