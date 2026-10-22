import { Keyring } from '@subwallet/keyring';
import { accountKey } from '@subwallet/ui-keyring/defaults';
import { u8aEq } from '@polkadot/util';
import { EXTENSION_PREFIX } from '@extension-base/defaults';
import { PASSWORD_STORAGE_KEY } from '@extension-base/stores/WalletStorage';
import type { KeyringPair$Json, KeyringPasswordJson } from '@subwallet/keyring/types';

export function preparePasswordRecords(records: Record<string, unknown>, oldPassword: string, newPassword: string) {
  if (!newPassword) throw new Error('Require new password');

  // Work on disposable pairs: the library's live changeMasterPassword mutates
  // its hash first, ignores individual re-encryption failures and writes async.
  const isolated = new Keyring({ type: 'sr25519' });
  const previousPassword = records[PASSWORD_STORAGE_KEY] as KeyringPasswordJson | undefined;

  if (previousPassword) {
    if (!previousPassword.passwordHash) throw new Error('Invalid wallet password record');
    isolated.setupMasterPassword(previousPassword.passwordHash);
    isolated.unlockKeyring(oldPassword);
  }

  const password = isolated.changeMasterPassword(newPassword, oldPassword);
  const accounts: KeyringPair$Json[] = [];
  const replacements: Record<string, unknown> = { [PASSWORD_STORAGE_KEY]: password };

  for (const [storageKey, value] of Object.entries(records)) {
    if (!storageKey.startsWith(`${EXTENSION_PREFIX}:account:`)) continue;

    const json = value as KeyringPair$Json;

    if (!json.meta?.isMasterPassword || json.meta.isInjected) continue;
    if (!previousPassword) throw new Error('Missing wallet password record');

    const pair = isolated.createFromJson(json);

    try {
      pair.decodePkcs8(oldPassword);
      const replacement = pair.toJson(newPassword);
      const verification = isolated.createFromJson(replacement);

      try {
        verification.decodePkcs8(newPassword);
        if (!u8aEq(pair.publicKey, verification.publicKey)) throw new Error('Account verification failed');

        if (`${EXTENSION_PREFIX}:${accountKey(pair.address)}` !== storageKey) {
          throw new Error('Account storage address mismatch');
        }
      } finally {
        verification.lock();
      }

      replacements[storageKey] = replacement;
      accounts.push(replacement);
    } finally {
      pair.lock();
    }
  }

  isolated.lockALl();

  return { replacements, accounts, password };
}
