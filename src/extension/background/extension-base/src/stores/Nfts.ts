import SubscribableStore from '@extension-base/stores/SubscribableStore';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import { type NftState } from '@extension-base/services/nft-service/types';

export default class NftStore extends SubscribableStore<NftState> {
  constructor() {
    super(`${EXTENSION_PREFIX}nfts`);
  }
}
