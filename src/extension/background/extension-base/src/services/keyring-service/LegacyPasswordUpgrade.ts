import { keyring } from '@subwallet/ui-keyring';
import AccountsStore from '@extension-base/stores/Accounts';
import { accountStorageKey, alreadyPersistedAccountStore, isCurrentAccountPair } from './AccountMetadata';
import type { KeyringPair } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';

export async function upgradeLegacyAccountPassword(original: KeyringPair, password: string): Promise<void> {
  const wasLocked = original.isLocked;
  let copy: KeyringPair;
  try {
    // Work on an independent encrypted copy. A failed write leaves the live
    // pair's password and migration flags usable for the next attempt.
    const backup = original.toJson(password);
    copy = keyring.createFromJson({ ...backup, meta: { ...backup.meta } });
    copy.decodePkcs8(password);
  } finally {
    if (wasLocked) original.lock();
  }
  const json = keyring.keyring.createJsonPairWithMasterPassword(copy);
  json.meta = { ...json.meta, isMasterPassword: true, isMasterAccount: copy.haveEntropy };
  delete json.meta.pendingMigrate;
  delete json.meta.isSubWallet;
  copy.lock();

  const committed = await new AccountsStore().updateAndWait(accountStorageKey(original), (current) => {
    if (!current || !isCurrentAccountPair(original)) throw new Error('Account changed during password migration. Retry with the current account.');
    const meta: FWKeyringMeta = { ...current.meta, isMasterPassword: true, isMasterAccount: copy.haveEntropy };
    delete meta.pendingMigrate;
    delete meta.isSubWallet;
    return { ...current, ...json, meta };
  }, (saved) => {
    if (!isCurrentAccountPair(original)) return;
    const restored = keyring.keyring.addFromJson(saved);
    keyring.accounts.add(alreadyPersistedAccountStore, restored.address, restored.publicKey, saved, restored.type);
  });
  if (!committed) throw new Error('Account password migration was not committed.');
}
