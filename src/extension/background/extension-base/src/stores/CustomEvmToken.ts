import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';
import type { CustomTokenJson } from '@extension-base/api/evm/types/ether';

export default class CustomTokenStore extends SubscribableStore<CustomTokenJson> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}customToken` : null);
  }
}
