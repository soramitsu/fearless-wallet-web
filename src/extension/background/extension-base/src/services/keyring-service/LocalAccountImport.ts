import { keyring } from '@subwallet/ui-keyring';
import { u8aEq, stringToU8a } from '@polkadot/util';
import AccountsStore from '@extension-base/stores/Accounts';
import { accountStorageKey, alreadyPersistedAccountStore } from './AccountMetadata';
import { PREVIOUS_PASSWORD_REQUIRED } from './AccountAccessErrors';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';
import type { WalletEcosystem } from '@/interfaces';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

const assertKey = (pair: KeyringPair, expected: KeyringPair) => {
  if (pair.type !== expected.type || !u8aEq(pair.publicKey, expected.publicKey)) {
    throw new Error('Stored account key does not match the imported key.');
  }
  const proof = stringToU8a('Fearless stored account key validation');
  if (!pair.verify(proof, pair.sign(proof), pair.publicKey)) {
    throw new Error('Stored account private key does not match its public key.');
  }
};

function publish(json: KeyringPair$Json): void {
  const pair = keyring.keyring.addFromJson(json);
  keyring.accounts.add(alreadyPersistedAccountStore, pair.address, pair.publicKey, json, pair.type);
}

function masterMetadata(meta: FWKeyringMeta, haveEntropy: boolean): FWKeyringMeta {
  const result: FWKeyringMeta = { ...meta, isMasterPassword: true, isMasterAccount: haveEntropy && !meta.isMnemonicUnverified };
  delete result.pendingMigrate;
  delete result.isSubWallet;
  return result;
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
    let json: KeyringPair$Json;
    let haveEntropy = pair.haveEntropy;

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
      try {
        try { storedPair.decodePkcs8(currentPassword); } catch {
          // A matching raw key proves this account, but cannot recover mnemonic entropy or
          // keys for its linked networks. Keep the original encrypted record for recovery.
          throw new Error(PREVIOUS_PASSWORD_REQUIRED);
        }
        // PKCS8 can carry a different public key than the JSON header.
        assertKey(storedPair, pair);
        if (existing.meta.isMasterPassword) {
          publish(existing);
          return pair.address;
        }
        haveEntropy = storedPair.haveEntropy;
        // The old password happens to equal the current one. Only migration flags change;
        // even a raw-key import retains the existing ciphertext and encrypted mnemonic.
        json = { ...existing, meta: masterMetadata(existing.meta, haveEntropy) };
      } finally { storedPair.lock(); }
    } else {
      const meta = masterMetadata(withUniversalWalletKeyringMeta<FWKeyringMeta>(
        pair.address,
        { ...pair.meta, isMobile: false, whenCreated: pair.meta.whenCreated || Date.now() },
        walletEcosystem
      ), haveEntropy);
      json = { ...pair.toJson(currentPassword), meta };
      const verified = keyring.createFromJson({ ...json, meta: { ...meta } });
      try {
        verified.decodePkcs8(currentPassword);
        assertKey(verified, pair);
      } finally { verified.lock(); }
    }
    assertUnlocked();

    await store.updateAndWait(storageKey, (current) => {
      assertUnlocked();
      // Metadata may have changed while queued. A different encrypted record, or deletion,
      // must not be overwritten by a stale import; unknown fields survive migration.
      if (existing ? !current || current.address !== existing.address || current.encoded !== existing.encoded
        || JSON.stringify(current.encoding) !== JSON.stringify(existing.encoding) : current !== undefined) {
        throw new Error('Account changed during import. Retry with the current account.');
      }
      if (!current) return json;
      if (['isExternal', 'isHardware', 'isInjected', 'isMobile'].some((flag) => current.meta[flag])) {
        throw new Error('Account changed during import. Retry with the current account.');
      }
      return { ...current, meta: masterMetadata(current.meta, haveEntropy) };
    }, publish, false);
    // A write already submitted may finish after lock; retain it, but reject late selection.
    assertUnlocked();
    return pair.address;
  } finally { pair.lock(); }
}
