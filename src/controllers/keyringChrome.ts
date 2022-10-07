import { Keyring } from '@polkadot/ui-keyring';
import { accountStore } from '@extension-base/stores/Accounts';

class KeyringChrome extends Keyring {
  constructor() {
    super();
    this._store = accountStore;
  }
}
export const keyring = new KeyringChrome();
