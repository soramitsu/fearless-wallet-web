import { keyring } from '@subwallet/ui-keyring';
import { u8aEq } from '@polkadot/util';
import AccountsStore from '@extension-base/stores/Accounts';
import { accountStorageKey, alreadyPersistedAccountStore } from './AccountMetadata';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';
import type { WalletEcosystem } from '@/interfaces';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

const assertKey = (pair: KeyringPair, expected: KeyringPair) => {
  if (pair.type !== expected.type || !u8aEq(pair.publicKey, expected.publicKey)) {
    throw new Error('Stored account key does not match the imported key.');
  }
};

function publish(json: KeyringPair$Json): void {
  const pair = keyring.keyring.addFromJson(json);
  keyring.accounts.add(alreadyPersistedAccountStore, pair.address, pair.publicKey, json, pair.type);
}

/** Called inside the password-change queue with a detached, unlocked key pair. No live account
 * or observable is changed until storage acknowledges the verified encrypted record. */
export async function importLocalAccount(
  pair: KeyringPair,
  walletEcosystem: WalletEcosystem,
  password: () => string
): Promise<string> {
  const currentPassword = password();
  const assertUnlocked = () => {
    if (!currentPassword || password() !== currentPassword || keyring.keyring.isLocked) {
      throw new Error('Wallet locked during account import. Unlock and retry.');
    }
  };

  try {
    assertUnlocked();
    const store = new AccountsStore();
    const storageKey = accountStorageKey(pair);
    const existing = await store.getAndWait(storageKey);
    assertUnlocked();

    if (existing) {
      if (['isExternal', 'isHardware', 'isInjected', 'isMobile'].some((flag) => existing.meta[flag])) {
        throw new Error('This account already belongs to an external wallet.');
      }
      const storedPair = keyring.createFromJson({ ...existing, meta: { ...existing.meta } });
      // Older Ethereum JSON may carry the 20-byte address instead of its full public key.
      // Bind that header to the storage identity, then verify the decrypted public key below.
      if (storedPair.type !== pair.type || accountStorageKey(storedPair) !== storageKey) {
        throw new Error('Stored account key does not match the imported key.');
      }
      let opens = false;
      try {
        storedPair.decodePkcs8(currentPassword);
        opens = true;
      } catch { /* A matching imported key can repair an older encrypted copy. */ }
      try {
        if (opens) {
          // PKCS8 can carry a different public key than the JSON header.
          assertKey(storedPair, pair);
          if (existing.meta.isMasterPassword) {
            publish(existing);
            return pair.address;
          }
        }
      } finally { storedPair.lock(); }
    }

    const meta: FWKeyringMeta = existing ? { ...existing.meta } : withUniversalWalletKeyringMeta<FWKeyringMeta>(
      pair.address,
      { ...pair.meta, isMobile: false, whenCreated: pair.meta.whenCreated || Date.now() },
      walletEcosystem
    );
    meta.isMasterPassword = true;
    meta.isMasterAccount = pair.haveEntropy;
    delete meta.pendingMigrate;
    delete meta.isSubWallet;
    const json = { ...pair.toJson(currentPassword), meta };
    const verified = keyring.createFromJson({ ...json, meta: { ...meta } });
    try {
      verified.decodePkcs8(currentPassword);
      assertKey(verified, pair);
    } finally { verified.lock(); }
    assertUnlocked();

    await store.updateAndWait(storageKey, (current) => {
      assertUnlocked();
      // Metadata may have changed while queued. A different encrypted record, or deletion,
      // must not be overwritten by a stale import; unknown fields survive a repair.
      if (existing ? !current || current.address !== existing.address || current.encoded !== existing.encoded
        || JSON.stringify(current.encoding) !== JSON.stringify(existing.encoding) : current !== undefined) {
        throw new Error('Account changed during import. Retry with the current account.');
      }
      if (!current) return json;
      const latestMeta: FWKeyringMeta = { ...current.meta, isMasterPassword: true, isMasterAccount: pair.haveEntropy };
      delete latestMeta.pendingMigrate;
      delete latestMeta.isSubWallet;
      return { ...current, ...json, meta: latestMeta };
    }, publish, false);
    // A write already submitted may finish after lock; retain it, but reject late selection.
    assertUnlocked();
    return pair.address;
  } finally { pair.lock(); }
}
