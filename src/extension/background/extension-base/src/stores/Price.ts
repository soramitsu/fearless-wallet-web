import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';
import { type PriceJson } from '@extension-base/background/types/types';

export default class PriceStore extends SubscribableStore<PriceJson> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}price` : null);
  }
}
