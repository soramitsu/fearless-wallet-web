import AuthClient from '@walletconnect/auth-client';
import { PROJECT_ID_EXTENSION, WALLET_CONNECT_METADATA } from './consts';
import WalletConnectStorage from './storage';

export default class WalletConnectDAppService {
  app: AuthClient | undefined;
  constructor() {
    this.initApp().catch(console.error);
  }

  async initApp() {
    this.app = await AuthClient.init({
      projectId: PROJECT_ID_EXTENSION,
      ...WALLET_CONNECT_METADATA,
      storage: new WalletConnectStorage(),
    });
  }

  async initSession(): Promise<string> {
    if (!this.app) throw new Error('App client not init');

    const { uri } = await this.app.core.pairing.create();

    return uri;
  }

  disconnect(topic: string) {
    this.app?.core.pairing.disconnect({ topic });
  }

  onResponse() {
    this.app?.on('auth_response', ({ params }) => {
      if (params) {
        // Response contained a valid signature -> user is authenticated.
      } else {
        // Handle error or invalid signature case
        console.error(params);
      }
    });
  }

  onRequest() {
    this.app?.on('auth_request', ({ params }) => {
      if (params) {
        // Response contained a valid signature -> user is authenticated.
      } else {
        // Handle error or invalid signature case
        console.error(params);
      }
    });
  }
}
