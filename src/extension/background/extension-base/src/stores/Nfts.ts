import SubscribableStore from '@extension-base/stores/SubscribableStore';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import { type NftStoreState } from '@extension-base/services/nft-service/types';

export default class NftStore extends SubscribableStore<NftStoreState> {
  constructor() {
    super(`${EXTENSION_PREFIX}nfts`);
  }
}
