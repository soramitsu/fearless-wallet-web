import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';
import type { FWKeyringMeta } from '@extension-base/types';

export interface TonStoreAccount {
  name: string;
  address: string;
  cipherSeed: string;
  meta?: FWKeyringMeta;
  publicKeyHex: string;
}

class TonStore extends SubscribableStore<TonStoreAccount> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}:ton` : null);
  }
}

export const tonStore = new TonStore();
