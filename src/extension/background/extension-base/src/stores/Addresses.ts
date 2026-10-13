import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from './BaseExtension';
import BaseWebStore from './BaseWeb';
import type { KeyringJson } from '@subwallet/ui-keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';
import { IS_EXTENSION } from '@/consts/global';

export type PublicAddressJson = KeyringJson & { meta: FWKeyringMeta };

/** Public addresses share the keyring namespace, but have no encrypted private key. */
export default class AddressesStore extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<PublicAddressJson> {
  constructor() {
    super(EXTENSION_PREFIX);
  }

  public updateAndWait(
    key: string,
    transform: (current: PublicAddressJson | undefined) => PublicAddressJson | undefined,
    publish?: (committed: PublicAddressJson) => void,
    trackFailure = true
  ): Promise<PublicAddressJson | undefined> {
    return super.updateAndWait(key, transform, publish, trackFailure);
  }
}
