import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import { readWalletRecords, writeWalletRecords } from '@extension-base/stores/WalletStorage';
import { chrome } from '@extension-base/utils/crossenv';
import { IS_EXTENSION } from '@/consts/global';

export interface TonStoreAccount {
  name: string;
  address: string;
  cipherSeed: string;
  publicKeyHex: string;
}

class TonStore extends SubscribableStore<TonStoreAccount> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}:ton` : null);
  }

  getPrefix(): string {
    return EXTENSION_PREFIX ? `${EXTENSION_PREFIX}:ton:` : '';
  }

  async readAll(): Promise<TonStoreAccount[]> {
    const records = await readWalletRecords();

    return Object.entries(records)
      .filter(([key]) => key.startsWith(this.getPrefix()))
      .flatMap(([key, value]) => {
        const record = value as TonStoreAccount;

        // A record this wallet did not write is left in storage untouched and not listed; it must not hide the
        // other TON accounts.
        if (!record || key !== this.getPrefix() + record.address || !/^[a-f0-9]{64}$/.test(record.publicKeyHex)) {
          console.error('Skipped a TON storage record in an unknown layout');

          return [];
        }

        return [record];
      });
  }

  async saveMany(accounts: TonStoreAccount[]): Promise<void> {
    if (!accounts.length) return;

    await writeWalletRecords(
      Object.fromEntries(accounts.map((account) => [this.getPrefix() + account.address, account]))
    );
  }

  async removeAccount(address: string): Promise<void> {
    if (!IS_EXTENSION) {
      const webStore = new (class extends BaseWebStore<TonStoreAccount> {})(null);

      return webStore.removeFromDB(this.getPrefix() + address);
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(this.getPrefix() + address, () => {
        if (chrome.runtime.lastError) return reject(new Error('Unable to remove TON account'));

        resolve();
      });
    });
  }
}

export const tonStore = new TonStore();
