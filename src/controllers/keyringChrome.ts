import { Keyring } from '@polkadot/ui-keyring';
import AccountsStore from '../storeChrome/Accounts';

class KeyringChrome extends Keyring {
  constructor() {
    super();
    this._store = new AccountsStore();
  }
}
export const keyring = new KeyringChrome();
