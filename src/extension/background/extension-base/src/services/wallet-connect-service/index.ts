import State from '@extension-base/background/handlers/State';

export default class WalletConnectService {
  readonly state: State;

  constructor(state: State) {
    this.state = state;
  }

  public addConnection(uri: string) {
    console.info(uri);
  }
}
