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
  /** The latest full read of the TON accounts. Background start-up waits for it, so a
   * TON-only wallet is never reported as having no accounts. */
  public loaded: Promise<void> = Promise.resolve();

  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}:ton` : null);
  }

  public all(update: (key: string, value: TonStoreAccount) => void): Promise<void> {
    this.loaded = super.all(update);

    return this.loaded;
  }
}

export const tonStore = new TonStore();
