import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import type { FWKeyringMeta } from '../types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { KeyringStore } from '@subwallet/ui-keyring/types';
import { IS_EXTENSION } from '@/consts/global';

type FWKeyringJson = KeyringPair$Json & { meta: FWKeyringMeta };

export default class AccountsStore
  extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<FWKeyringJson>
  implements KeyringStore
{
  public allLoaded: Promise<void> = Promise.resolve();

  constructor() {
    super(EXTENSION_PREFIX);
  }

  public set(key: string, value: FWKeyringJson, update?: () => void): void {
    super.set(key, value, update);
  }

  public setAndWait(key: string, value: FWKeyringJson): Promise<void> {
    return super.setAndWait(key, value);
  }

  public getAndWait(key: string): Promise<FWKeyringJson | undefined> {
    return super.getAndWait(key);
  }

  public updateAndWait(
    key: string,
    transform: (current: FWKeyringJson | undefined) => FWKeyringJson | undefined,
    publish?: (committed: FWKeyringJson) => void,
    trackFailure = true
  ): Promise<FWKeyringJson | undefined> {
    return super.updateAndWait(key, transform, publish, trackFailure);
  }

  public get(key: string, update: (value: FWKeyringJson) => void): void {
    super.get(key, update);
  }

  public remove(key: string, update?: () => void): void {
    super.remove(key, update);
  }

  public all(update: (key: string, value: FWKeyringJson) => void): void {
    this.allLoaded = Promise.resolve(super.all(update));
  }
}
