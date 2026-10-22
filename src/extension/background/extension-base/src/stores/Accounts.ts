import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import { removeWalletRecords, scheduleWalletWrite, writeWalletRecords } from '@extension-base/stores/WalletStorage';
import type { FWKeyringMeta } from '../types';
import type { KeyringStore } from '@subwallet/ui-keyring/types';
import { IS_EXTENSION } from '@/consts/global';

type FWKeyringJson = {
  address: string;
  meta: FWKeyringMeta;
};

export default class AccountsStore
  extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<FWKeyringJson>
  implements KeyringStore
{
  constructor() {
    super(EXTENSION_PREFIX);
  }

  // Same keys as before (fw:<key>); the writes are queued so a password change or reset can wait for them.
  public set(key: string, value: FWKeyringJson, update?: () => void): void {
    scheduleWalletWrite(() => writeWalletRecords({ [`${EXTENSION_PREFIX}:${key}`]: value }), update);
  }

  public get(key: string, update: (value: FWKeyringJson) => void): void {
    super.get(key, update);
  }

  public remove(key: string, update?: () => void): void {
    scheduleWalletWrite(() => removeWalletRecords([`${EXTENSION_PREFIX}:${key}`]), update);
  }

  public all(update: (key: string, value: FWKeyringJson) => void): void {
    super.all(update);
  }
}
