import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, KeyringPairJson & { accounts: Record<string, KeyringPairJson>; ton: TonStoreAccount; cipherSeed: string; pendingCipherSeed?: string }>,
  writes: [] as Array<() => void>,
  writeKeys: [] as string[][],
  removals: [] as Array<{ keys: string[]; finish: () => void }>,
  failRead: false, failWrite: false, failRemove: false, failSelection: false, failKey: '',
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => path },
}));
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys: unknown, callback: (data: typeof fixture.data) => void) => {
      fixture.runtime.lastError = fixture.failRead ? { message: 'Removal read failed' } : undefined;
      callback(structuredClone(fixture.data));
      fixture.runtime.lastError = undefined;
    },
    set: (data: typeof fixture.data, callback: () => void) => {
      const snapshot = structuredClone(data);
      fixture.writeKeys.push(Object.keys(snapshot));
      fixture.writes.push(() => {
        const failed = fixture.failWrite || Object.keys(snapshot).some(key => key.startsWith(fixture.failKey || 'no-failure-prefix')) || (fixture.failSelection && Object.hasOwn(snapshot, 'fwcurrent_account:CurrentAccountInfo'));
        fixture.runtime.lastError = failed ? { message: 'Recovery write failed' } : undefined;
        if (!failed) Object.assign(fixture.data, snapshot);
        callback();
        fixture.runtime.lastError = undefined;
      });
    },
    remove: (keys: string | string[], callback: () => void) => {
      const snapshot = typeof keys === 'string' ? [keys] : [...keys];
      fixture.removals.push({ keys: snapshot, finish: () => {
        fixture.runtime.lastError = fixture.failRemove ? { message: 'Removal failed' } : undefined;
        if (!fixture.failRemove) snapshot.forEach((key) => delete fixture.data[key]);
        callback();
        fixture.runtime.lastError = undefined;
      } });
    },
  } },
} }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { Keyring } from '@subwallet/keyring/keyring';
import { accountStorageKey } from '@extension-base/services/keyring-service/AccountMetadata';
import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import KeyringStore from '@extension-base/stores/KeyringStore';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
import type { KeyringPair$Json as KeyringPairJson, KeypairType } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';

const PASSWORD = 'Public removal fixture password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
let service: KeyringService;
let pending: Promise<unknown>[];
function track<T>(promise: Promise<T> | T) {
  const result = Promise.resolve(promise).then((value) => ({ value }), (error) => ({ error }));
  pending.push(result);
  return result;
}
async function drain(remove = true) {
  for (let i = 0; i < 20; i++) {
    fixture.writes.splice(0).forEach((finish) => finish());
    if (remove) fixture.removals.splice(0).forEach(({ finish }) => finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
async function native(type: KeypairType = 'sr25519', ecosystem = WalletEcosystem.Substrate) {
  const result = track(service.addAccount(PHRASE, { name: 'Public removal wallet' }, ecosystem, type));
  await drain();
  const outcome = await result;
  if (!('value' in outcome)) throw outcome.error;
  return outcome.value;
}

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  fixture.writes = [];
  fixture.writeKeys = [];
  fixture.removals = [];
  fixture.failRead = fixture.failWrite = fixture.failRemove = fixture.failSelection = false;
  fixture.failKey = '';
  pending = [];
  for (const subject of [keyring.accounts, keyring.addresses, keyring.contracts]) {
    for (const address of Object.keys(subject.subject.value)) subject.removeSubjectOnly(address);
  }
  vi.spyOn(keyring.keyringOption, 'init').mockImplementation(() => {});
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: new AccountsStore(),
    password_store: new KeyringStore(),
  });
  keyring.changeMasterPassword(PASSWORD);
  await drain();
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: PASSWORD, tonKeyring: new TonKeyringService(service),
    currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0,
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn(), clearPreviousMasterPair: vi.fn(), reset: vi.fn(), cancelScan: vi.fn() }, scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  fixture.failRead = fixture.failWrite = fixture.failRemove = fixture.failSelection = false;
  await drain();
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});


const NEW_PASSWORD = 'Public replacement master password';
const change = () => track(service.changeMasterPassword({ oldPassword: PASSWORD, newPassword: NEW_PASSWORD }));

describe('acknowledged master-password change', { timeout: 60_000 }, () => {
  it.each([false, true])('rejects a password request admitted during reset (reset fails: %s)', async fails => {
    await native();
    let entered = false;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const resetting = track(service.resetWallet(async () => {
      entered = true;
      await barrier;
      if (fails) throw new Error('Public reset prerequisite failure');
    }));
    await vi.waitFor(() => expect(entered).toBe(true));
    const changing = change();
    release();
    await drain();
    expect(await resetting).toEqual({ value: !fails });
    expect(await changing).toEqual({ value: false });
    if (fails) expect(service.getPassword()).toBe(PASSWORD);
    else {
      expect(service.hasMasterPassword).toBe(false);
      expect(fixture.data['fw:keyring']).toBeUndefined();
      expect(service.getPassword()).toBe('');
    }
  });

  it.each(['password', 'phrase', 'migration'])('orders retained-account %s recovery after a submitted password change', async kind => {
    await native();
    const phrase = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
    const previous = 'Public previous account password';
    const pair = keyring.createFromUri(phrase, { name: 'Retained account', isMasterPassword: kind !== 'migration' }, 'sr25519');
    const json = pair.toJson(previous);
    fixture.data['fw:' + accountStorageKey(pair)] = json as never;
    keyring.keyring.addFromJson(json);
    keyring.accounts.add(new AccountsStore(), pair.address, pair.publicKey, json, pair.type);
    await drain();
    const changing = change();
    await vi.waitFor(() => expect(fixture.writes.length).toBeGreaterThan(0));
    const recovering = track<unknown>(kind === 'migration' ? service.keyringMigrateMasterPassword({ address: pair.address, password: previous }) : kind === 'password'
      ? service.recoverAccountWithPassword({ address: pair.address, walletEcosystem: WalletEcosystem.Substrate, password: previous })
      : service.recoverAccountWithPhrase({ address: pair.address, walletEcosystem: WalletEcosystem.Substrate, phrase }));
    await drain();
    expect(await changing).toEqual({ value: true });
    expect(await recovering).toEqual({ value: kind === 'migration' ? true : { ok: true } });
    const restored = keyring.createFromJson(fixture.data['fw:' + accountStorageKey(pair)]);
    expect(() => restored.decodePkcs8(NEW_PASSWORD)).not.toThrow();
    expect(service.exportMnemonic({ address: pair.address, password: NEW_PASSWORD, walletEcosystem: WalletEcosystem.Substrate }).seed).toBe(phrase);
  });

  it('keeps the live password and pair unchanged until storage acknowledgement', async () => {
    const address = await native();
    const pair = service.getPair(address);
    const changing = change();
    await vi.waitFor(() => expect(fixture.writes.length).toBeGreaterThan(0));
    expect(service.getPassword()).toBe(PASSWORD);
    expect(service.getPair(address)).toBe(pair);
    await drain();
    expect(await changing).toEqual({ value: true });
    expect(service.getPassword()).toBe(NEW_PASSWORD);
  });

  it.each(['fw:keyring', 'fw:account:'])('does not split password and accounts after %s write failure', async failKey => {
    const address = await native();
    const original = structuredClone(fixture.data);
    const pair = service.getPair(address);
    fixture.failKey = failKey;
    const changing = change();
    await drain();
    expect(await changing).not.toEqual({ value: true });
    expect(fixture.data).toEqual(original);
    expect(service.getPassword()).toBe(PASSWORD);
    expect(service.getPair(address)).toBe(pair);
    fixture.failKey = '';
    const retry = change();
    await drain();
    expect(await retry).toEqual({ value: true });
    expect(service.exportMnemonic({ address, password: NEW_PASSWORD, walletEcosystem: WalletEcosystem.Substrate }).seed).toBe(PHRASE);
  });

  it('preserves latest stored metadata and unknown fields while changing ciphertext', async () => {
    const address = await native();
    const entry = Object.entries(fixture.data).find(([key, record]) => key.startsWith('fw:account:') && record.address === address)!;
    Object.assign(entry[1], { publicUnknownField: { retained: true } });
    entry[1].meta.name = 'Latest retained name';
    const changing = change();
    await drain();
    expect(await changing).toEqual({ value: true });
    expect(fixture.data[entry[0]]).toMatchObject({ publicUnknownField: { retained: true }, meta: { name: 'Latest retained name' } });
    expect(service.exportMnemonic({ address, password: NEW_PASSWORD, walletEcosystem: WalletEcosystem.Substrate }).seed).toBe(PHRASE);
  });

  it('does not report a late password change success after the user locks', async () => {
    await native();
    const changing = change();
    await vi.waitFor(() => expect(fixture.writes.length).toBeGreaterThan(0));
    expect(service.lockKeyring()).toBe(true);
    await drain();
    expect(await changing).not.toEqual({ value: true });
    expect(service.getPassword()).toBe('');
    expect(service.keyringIsLocked).toBe(true);
  });

  // 3.0.6: once the batch is stored the new password is in force, whatever failed in memory afterwards.
  it('locks the wallet when memory cannot follow a stored password change', async () => {
    const address = await native();
    vi.spyOn(keyring.keyring, 'addFromJson').mockImplementationOnce(() => { throw new Error('Public memory failure'); });
    const changing = change();
    await drain();
    // Not confirmed, as after a lock during the change; the screen then suggests the new password first.
    expect(await changing).not.toEqual({ value: true });
    expect(service.getPassword()).toBe('');
    expect(service.keyringIsLocked).toBe(true);
    const verifier = new Keyring();
    verifier.setupMasterPassword((fixture.data['fw:keyring'] as unknown as { passwordHash: string }).passwordHash);
    expect(() => verifier.unlockKeyring(PASSWORD)).toThrow();
    verifier.unlockKeyring(NEW_PASSWORD);
    const stored = keyring.createFromJson(structuredClone(fixture.data['fw:' + accountStorageKey(service.getPair(address)!)]!));
    expect(() => stored.decodePkcs8(NEW_PASSWORD)).not.toThrow();
    stored.lock();
  });

  it('reports a stored reset, with the wallet locked, when clearing memory fails', async () => {
    await native();
    vi.spyOn(keyring.keyring, 'removePair').mockImplementationOnce(() => { throw new Error('Public memory failure'); });
    const resetting = track(service.resetWallet());
    await drain();
    expect(await resetting).toEqual({ value: true });
    expect(service.getPassword()).toBe('');
    expect(fixture.data['fw:keyring']).toBeUndefined();
    expect(Object.keys(fixture.data).some((key) => key.startsWith('fw:account:'))).toBe(false);
    expect(Object.keys(fixture.data).some((key) => key.startsWith('fw:deletedWallet:'))).toBe(true);
  });

  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as KeypairType[])('retains the %s phrase and key through acknowledged rotation', async type => {
    const ecosystem = type === 'ethereum' ? WalletEcosystem.Evm : WalletEcosystem.Substrate;
    const address = await native(type, ecosystem);
    const expected = service.getPair(address)!.publicKey.slice();
    const changing = change();
    await drain();
    expect(await changing).toEqual({ value: true });
    const original = fixture.data['fw:' + accountStorageKey(service.getPair(address)!)];
    expect(original).toBeDefined();
    const restored = keyring.createFromJson(structuredClone(original!));
    try {
      restored.decodePkcs8(NEW_PASSWORD);
      expect(restored.publicKey).toEqual(expected);
      expect(service.exportMnemonic({ address, password: NEW_PASSWORD, walletEcosystem: ecosystem }).seed).toBe(PHRASE);
    } finally { restored.lock(); }
  });

  it('rejects a wrong password without writes or changes', async () => {
    await native();
    const original = structuredClone(fixture.data);
    fixture.writeKeys = [];
    expect(await service.changeMasterPassword({ oldPassword: 'Public wrong password', newPassword: NEW_PASSWORD })).toBe(false);
    expect(fixture.data).toEqual(original);
    expect(fixture.writeKeys).toEqual([]);
  });
});
