import { compareSync, getRounds, hashSync } from 'bcryptjs';
import { keyring } from '@subwallet/ui-keyring';
import AccountsStore from '../../stores/Accounts';
import KeyringStoreWeb from '../../stores/KeyringStoreWeb';
import { decodeWebPassword, WEB_PASSWORD_RECORD_KEY, validateWebPasswordRecord } from '../../stores/WebPasswordRecord';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import { IS_EXTENSION } from '@/consts/global';

// Keep bcrypt's existing wire format so historical releases can still unlock.
// Cost 6 made this verifier a cheaper offline oracle than the encrypted keys.
export const PASSWORD_VERIFIER_COST = 12;

export function createPasswordVerifier(password: string): KeyringPasswordJson {
  if (!password) throw new Error('Require new password');
  return { passwordHash: hashSync(password, PASSWORD_VERIFIER_COST) };
}

/** Rehash only the verifier, without touching account ciphertext or recovery copies.
 * The caller holds the password/reset queue and rejects stale authentication. */
export async function upgradePasswordVerifier(password: string, assertCurrent: () => void): Promise<void> {
  assertCurrent();
  const store = new AccountsStore();
  const passwordKey = IS_EXTENSION ? 'keyring' : WEB_PASSWORD_RECORD_KEY;
  let snapshot: Record<string, unknown> = {};
  await store.allMap(records => { snapshot = records; });
  assertCurrent();
  const previous = IS_EXTENSION ? snapshot[passwordKey] as KeyringPasswordJson | undefined
    : decodeWebPassword(validateWebPasswordRecord(snapshot[passwordKey]).serialized);
  if (!previous || typeof previous.passwordHash !== 'string' ||
    !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(previous.passwordHash) ||
    !compareSync(password, previous.passwordHash)) throw new Error('Wallet password changed. Unlock and retry.');
  if (getRounds(previous.passwordHash) >= PASSWORD_VERIFIER_COST) return;
  const next = { ...previous, ...createPasswordVerifier(password) };
  assertCurrent();
  await store.mutateRecordsAndWait([passwordKey], current => {
    assertCurrent();
    if (JSON.stringify(current[passwordKey]) !== JSON.stringify(snapshot[passwordKey]))
      throw new Error('Wallet password changed during verifier upgrade.');
    return { entries: { [passwordKey]: IS_EXTENSION ? next
      : { ...snapshot[passwordKey] as object, version: 1, serialized: JSON.stringify(next) } }, remove: [] };
  }, () => {
    // Publishing a stronger hash must never unlock a session locked during storage.
    keyring.keyring.setupMasterPassword(next.passwordHash);
    if (!IS_EXTENSION) KeyringStoreWeb.commitPassword(next);
  });
  assertCurrent();
}
