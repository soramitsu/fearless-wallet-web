import type { KeyringJson, KeyringStore } from '@polkadot/ui-keyring/types';

import BaseStore from './Base';

export default class AccountsStore extends BaseStore<KeyringJson> implements KeyringStore {
  constructor() {
    super('accounts');
  }
}
