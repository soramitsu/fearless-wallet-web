import SubscribableStore from '@extension-base/stores/SubscribableStore';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import type { NetworkJson } from '@extension-base/types';

export default class NftStore extends SubscribableStore<Record<string, NetworkJson>> {
  constructor() {
    super(`${EXTENSION_PREFIX}nfts`);
  }
}
