import SubscribableStore from '@extension-base/stores/SubscribableStore';
import { EXTENSION_PREFIX } from '@extension-base/defaults';

export default class NetworkMapStore extends SubscribableStore<Record<string, string>> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}selectedNetworks` : null);
  }
}
