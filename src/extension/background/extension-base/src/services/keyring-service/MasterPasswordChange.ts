import { Keyring } from '@subwallet/keyring/keyring';
import { keyring } from '@subwallet/ui-keyring';
import { stringToU8a, u8aEq } from '@polkadot/util';
import AccountsStore from '../../stores/Accounts';
import KeyringStoreWeb from '../../stores/KeyringStoreWeb';
import { decodeWebPassword, WEB_PASSWORD_RECORD_KEY, validateWebPasswordRecord } from '../../stores/WebPasswordRecord';
import { accountStorageKey, alreadyPersistedAccountStore, isCurrentAccountPair } from './AccountMetadata';
import { isMasterPasswordPair } from './AccountAccess';
import { decryptTonSeed, encryptTonSeed } from './TonSeedVault';
import { rotateTonRecoverySeed } from './TonSeedEncoding';
import type { TonKeyringService } from './TonKeyring';
import type { TonStoreAccount } from '../../stores/TonStore';
import type { KeyringPair, KeyringPair$Json, KeyringPasswordJson } from '@subwallet/keyring/types';
import { IS_EXTENSION } from '@/consts/global';

type NativeChange = { original: KeyringPair; before: KeyringPair$Json; json: KeyringPair$Json };
type TonChange = { before: TonStoreAccount; cipherSeed: string };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const assertPairKey = (pair: KeyringPair, original: KeyringPair) => {
  const proof = stringToU8a('Fearless password change key verification');
  if (pair.type !== original.type || !u8aEq(pair.publicKey, original.publicKey) ||
    !pair.verify(proof, pair.sign(proof), pair.publicKey)) throw new Error('Password change key verification failed.');
};

/** Prepare detached verified ciphertext, then commit password, native and TON records together.
 * No live password or pair changes before storage acknowledges the complete record set. */
export async function commitMasterPasswordChange(
  pairs: KeyringPair[], ton: TonKeyringService, hadPassword: boolean,
  oldPassword: string | undefined, newPassword: string,
  assertCurrent: () => void, publishPassword: (password: string) => boolean
): Promise<string[]> {
  const store = new AccountsStore();
  let snapshot: Record<string, unknown> = {};
  await store.allMap(records => { snapshot = records; });
  assertCurrent();
  const passwordKey = IS_EXTENSION ? 'keyring' : WEB_PASSWORD_RECORD_KEY;
  const previous = IS_EXTENSION ? snapshot[passwordKey] as KeyringPasswordJson | undefined
    : decodeWebPassword(validateWebPasswordRecord(snapshot[passwordKey]).serialized);
  if (!!previous !== hadPassword) throw new Error('Password state changed. Reload and retry.');
  const detached = new Keyring();
  if (previous) {
    if (typeof previous.passwordHash !== 'string' || !oldPassword) throw new Error('Current password required.');
    detached.setupMasterPassword(previous.passwordHash);
    detached.unlockKeyring(oldPassword);
  }
  const nextPassword = { ...previous, ...detached.changeMasterPassword(newPassword, oldPassword) };
  detached.lockALl();
  const native = new Map<string, NativeChange>();
  const retained: string[] = [];
  for (const original of pairs.filter(isMasterPasswordPair)) {
    assertCurrent();
    if (!hadPassword || !oldPassword) { retained.push(original.address); continue; }
    const storageKey = accountStorageKey(original);
    const before = snapshot[storageKey] as KeyringPair$Json | undefined;
    if (!before) throw new Error('Account changed during password preparation.');
    const copy = detached.createFromJson(structuredClone(before));
    try {
      try { copy.decodePkcs8(oldPassword); } catch { retained.push(original.address); continue; }
      assertPairKey(copy, original);
      const json = copy.toJson(newPassword);
      const verified = detached.createFromJson(structuredClone(json));
      try { verified.decodePkcs8(newPassword); assertPairKey(verified, original); } finally { verified.lock(); }
      native.set(storageKey, { original, before, json });
    } finally { copy.lock(); }
  }
  const tonChanges = new Map<string, TonChange>();
  if (oldPassword) for (const [address, account] of Object.entries(ton.accountSubject.value)) {
    assertCurrent();
    const before = snapshot[`ton:${address}`] as TonStoreAccount | undefined;
    if (!before || before.publicKeyHex?.toLowerCase() !== Buffer.from(account.publicKey).toString('hex'))
      throw new Error('TON account changed during password preparation.');
    const recovery = rotateTonRecoverySeed(before.cipherSeed, oldPassword, newPassword, address, before.publicKeyHex);
    if (recovery) {
      tonChanges.set(`ton:${address}`, { before, cipherSeed: recovery });
      continue;
    }
    const seed = await decryptTonSeed(before.cipherSeed, oldPassword, account.publicKey)
      ?? await decryptTonSeed(before.pendingCipherSeed, oldPassword, account.publicKey);
    if (seed === undefined) continue;
    const cipherSeed = encryptTonSeed(seed, newPassword);
    if (await decryptTonSeed(cipherSeed, newPassword, account.publicKey) !== seed)
      throw new Error('TON password change verification failed.');
    tonChanges.set(`ton:${address}`, { before, cipherSeed });
  }
  assertCurrent();
  const committedNative: KeyringPair$Json[] = [];
  const committedTon: TonStoreAccount[] = [];
  await store.mutateRecordsAndWait([passwordKey, ...native.keys(), ...tonChanges.keys()], current => {
    assertCurrent();
    if (!equal(current[passwordKey], snapshot[passwordKey])) throw new Error('Password changed during preparation.');
    const entries: Record<string, unknown> = { [passwordKey]: IS_EXTENSION ? nextPassword
      : { ...snapshot[passwordKey] as object, version: 1, serialized: JSON.stringify(nextPassword) } };
    for (const [storageKey, { original, before, json }] of native) {
      const latest = current[storageKey] as KeyringPair$Json | undefined;
      if (!latest || !isCurrentAccountPair(original) || latest.address !== before.address || latest.encoded !== before.encoded ||
        !equal(latest.encoding, before.encoding) || !latest.meta?.isMasterPassword ||
        ['isExternal', 'isHardware', 'isInjected', 'isMobile'].some(flag => latest.meta[flag]))
        throw new Error('Account changed during password preparation.');
      const saved = { ...latest, encoded: json.encoded, encoding: json.encoding };
      entries[storageKey] = saved;
      committedNative.push(saved);
    }
    for (const [storageKey, { before, cipherSeed }] of tonChanges) {
      const latest = current[storageKey] as TonStoreAccount | undefined;
      if (!latest || latest.address !== before.address || latest.publicKeyHex !== before.publicKeyHex ||
        latest.cipherSeed !== before.cipherSeed || latest.pendingCipherSeed !== before.pendingCipherSeed)
        throw new Error('TON account changed during password preparation.');
      const { pendingCipherSeed: _pending, ...fields } = latest;
      const saved = { ...fields, cipherSeed };
      entries[storageKey] = saved;
      committedTon.push(saved);
    }
    return { entries, remove: [] };
  }, () => {
    keyring.keyring.setupMasterPassword(nextPassword.passwordHash);
    keyring.lockAll();
    if (!IS_EXTENSION) KeyringStoreWeb.commitPassword(nextPassword);
    for (const json of committedNative) {
      const pair = keyring.keyring.addFromJson(json);
      keyring.accounts.add(alreadyPersistedAccountStore, pair.address, pair.publicKey, json, pair.type);
    }
    for (const record of committedTon) ton.setAccounts(record);
    // A lock after submission does not undo the durable change or unlock the user.
    if (publishPassword(newPassword)) keyring.unlockKeyring(newPassword);
  });
  assertCurrent();
  return retained;
}
