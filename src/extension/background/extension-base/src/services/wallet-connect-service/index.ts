import State from '@extension-base/background/handlers/State';
import { Core } from '@walletconnect/core';
import WalletConnectStorage from './storage';

export default class WalletConnectService {
  readonly state: State;

  private client: any | undefined;

  constructor(state: State) {
    this.state = state;

    this.initClient();
  }

  public addConnection(uri: string) {
    console.info(uri);
  }

  public async initClient() {
    this.client = await Core.init({
      storage: new WalletConnectStorage(),
    });
  }
}
