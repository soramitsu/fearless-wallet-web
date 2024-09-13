import { type BalanceItem } from '@extension-base/api/evm/types';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';

export default class BalanceStore extends SubscribableStore<Record<string, BalanceItem>> {
  constructor() {
    super(`${EXTENSION_PREFIX}balance`);
  }
}
