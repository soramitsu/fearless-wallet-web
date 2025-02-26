import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
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

  public set(key: string, value: FWKeyringJson, update?: () => void): void {
    super.set(key, value, update);
  }

  public get(key: string, update: (value: FWKeyringJson) => void): void {
    super.get(key, update);
  }

  public remove(key: string, update?: () => void): void {
    super.remove(key, update);
  }

  public all(update: (key: string, value: FWKeyringJson) => void): void {
    super.all(update);
  }
}
