import BaseStore from '@extension-base/stores/Base';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import type { FWKeyringMeta } from '../types';
import type { KeyringStore } from '@polkadot/ui-keyring/types';

type FWKeyringJson = {
  address: string;
  meta: FWKeyringMeta;
};

export default class AccountsStore extends BaseStore<FWKeyringJson> implements KeyringStore {
  constructor() {
    super(EXTENSION_PREFIX);
  }

  public override set(key: string, value: FWKeyringJson, update?: () => void): void {
    super.set(key, value, update);
  }
}
