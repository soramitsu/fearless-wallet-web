import BaseStore from './Base';
import type { KeyringJson, KeyringStore } from '@polkadot/ui-keyring/types';

export default class AccountsStore extends BaseStore<KeyringJson> implements KeyringStore {
  constructor() {
    super('accounts');
  }
}
