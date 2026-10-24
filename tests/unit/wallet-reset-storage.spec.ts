import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';
import { api as apiSora } from '@sora-substrate/util';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, KeyringPairJson & { accounts: Record<string, KeyringPairJson>; ton: TonStoreAccount; cipherSeed: string; pendingCipherSeed?: string }>,
  writes: [] as Array<() => void>,
  writeKeys: [] as string[][],
  removals: [] as Array<{ keys: string[]; finish: () => void }>,
  failRead: false, failWrite: false, failRemove: false, failSelection: false,
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
        const failed = fixture.failWrite || (fixture.failSelection && Object.hasOwn(snapshot, 'fwcurrent_account:CurrentAccountInfo'));
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
vi.mock('@sora-substrate/sdk', () => ({ api: { bridgeProxy: { sub: {} } } }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { captureWalletResetGuard } from '@extension-base/api/walletResetGuard';
import { KeyringService } from '@extension-base/services/keyring-service';
import Extension from '@extension-base/background/handlers/Extension';
import State from '@extension-base/background/handlers/State';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { accountStoreKey, walletAddressIdentity } from '@extension-base/services/keyring-service/DeletedWallets';
import { updateAccountMetadata } from '@extension-base/services/keyring-service/AccountMetadata';
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
const archives = () => Object.entries(fixture.data).filter(([key]) => key.startsWith('fw:deletedWallet:')).map(([, value]) => value);

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  fixture.writes = [];
  fixture.writeKeys = [];
  fixture.removals = [];
  fixture.failRead = fixture.failWrite = fixture.failRemove = fixture.failSelection = false;
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
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn(), reset: vi.fn(), cancelScan: vi.fn() }, scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  fixture.failRead = fixture.failWrite = fixture.failRemove = fixture.failSelection = false;
  await drain();
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('acknowledged whole-wallet reset with retained keys', { timeout: 60_000 }, () => {
  it.each([false, true])('permanently invalidates an admitted transfer when actual reset starts (prerequisite fails: %s)', async fails => {
    const address = await native();
    const guard = captureWalletResetGuard({ keyringService: service } as State);
    const beforeRevision = service.walletResetRevision;
    let entered = false;
    const result = track(service.resetWallet(async () => {
      entered = true;
      expect(service.isResetting).toBe(true);
      expect(() => guard()).toThrow('Wallet changed during transfer');
      if (fails) throw new Error('Public revocation storage failure');
    }));
    await drain();
    expect(entered).toBe(true);
    expect(await result).toEqual({ value: !fails });
    expect(service.isResetting).toBe(false);
    expect(service.walletResetRevision).toBe(beforeRevision + 1);
    expect(() => guard()).toThrow('Wallet changed during transfer');
    if (fails) expect(service.getPair(address)).not.toBeNull();
  });

  it('clears the actual State signing contexts after durable selection and before archived-key removal', async () => {
    const address = await native();
    const state = Object.create(State.prototype) as State;
    Object.assign(state, { keyringService: service, poolsService: { unsubscribePools: vi.fn() },
      updateServiceInfo: vi.fn(), requestService: { resetWallet: vi.fn(async () => {}) },
      walletConnectDappService: { resetWallet: vi.fn(async () => {}) },
      walletConnectService: { resetWallet: vi.fn(async () => {}) } });
    const selection = track(state.setCurrentAccount({ address, name: 'Public fixture', ethereumAddress: '',
      isMobile: false, walletEcosystem: WalletEcosystem.Substrate }));
    await drain();
    expect(await selection).toHaveProperty('value');
    const sora = apiSora as unknown as { account?: { pair: unknown }; bridgeProxy: { sub: { account?: unknown } } };
    expect(sora.account?.pair).toBe(service.getPair(address));
    vi.mocked(state.poolsService.unsubscribePools).mockClear();
    const result = track(new Extension(state).handle('public-reset', 'pri(keyring.reset)', null));
    await drain(false);
    expect(service.currentAccountSubject.value).toBeNull();
    expect(fixture.data['fwcurrent_account:CurrentAccountInfo']).toBeNull();
    expect(sora.account).toBeUndefined();
    expect(sora.bridgeProxy.sub.account).toBeUndefined();
    expect(state.poolsService.unsubscribePools).toHaveBeenCalledOnce();
    expect(service.getPair(address)).not.toBeNull();
    await drain();
    expect(await result).toEqual({ value: true });
  });

  it('waits for storage before reporting reset or clearing the master password and live pair', async () => {
    const address = await native();
    const pair = service.getPair(address)!;
    let settled = false;
    const result = track(service.resetWallet()).then((outcome) => { settled = true; return outcome; });
    await drain(false);
    expect(settled).toBe(false);
    expect(service.hasMasterPassword).toBe(true);
    expect(service.getPair(address)).toBe(pair);
    await drain();
    expect(await result).toEqual({ value: true });
    expect(service.hasMasterPassword).toBe(false);
    expect(fixture.data['fw:keyring']).toBeUndefined();
    expect(service.getPair(address)).toBeNull();
  });

  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)('keeps exact %s encrypted records in recoverable archives after reset', async (type) => {
    const address = await native(type);
    const storageKey = accountStoreKey(service.getPair(address)!);
    const original = structuredClone(fixture.data[`fw:${storageKey}`]);
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: true });
    expect(fixture.data[`fw:${storageKey}`]).toBeUndefined();
    expect(archives().some((entry) => JSON.stringify(entry.accounts[storageKey]) === JSON.stringify(original))).toBe(true);
    const listed = track(service.getDeletedWallets());
    await drain();
    expect(await listed).toHaveProperty('value', expect.arrayContaining([expect.objectContaining({ address })]));
    const changed = track(service.changeMasterPassword({ newPassword: 'New public fixture password' }));
    await drain();
    expect(await changed).toEqual({ value: true });
    const id = Object.keys(fixture.data).find((key) => key.startsWith('fw:deletedWallet:'))!.slice('fw:deletedWallet:'.length);
    const restored = track(service.restoreDeletedWallet(id));
    await drain();
    expect(await restored).toHaveProperty('value.ok', true);
    const pair = service.getPair(address)!;
    pair.decodePkcs8(PASSWORD);
    expect(pair.verify(new Uint8Array([1, 7, 9]), pair.sign(new Uint8Array([1, 7, 9])), pair.publicKey)).toBe(true);
    expect(fixture.data[`fw:${storageKey}`]).toEqual(original);
  });

  it('keeps linked native records together and preserves all older recovery copies', async () => {
    const address = await native();
    const child = await native('ethereum');
    const linked = track(updateAccountMetadata(service.getPair(address)!, (meta) => ({ ...meta, ethereumAddress: child })));
    await drain();
    expect(await linked).toHaveProperty('value');
    const original = structuredClone(fixture.data);
    fixture.data['fw:deletedWallet:older'] = { preserved: 'older encrypted recovery entry' } as never;
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: true });
    expect(fixture.data['fw:deletedWallet:older']).toEqual({ preserved: 'older encrypted recovery entry' });
    const fresh = archives().filter((wallet) => wallet.accounts);
    expect(fresh).toHaveLength(1);
    for (const [key, record] of Object.entries(original).filter(([key]) => key.startsWith('fw:account:')))
      expect(fresh[0].accounts[key.slice(3)]).toEqual(record);
  });

  it('archives a valid unloaded key and leaves unrelated or inert records untouched', async () => {
    const detached = keyring.createFromUri(PHRASE, { name: 'Unloaded key' }, 'ed25519');
    const record = detached.toJson(PASSWORD);
    const storageKey = accountStoreKey(detached);
    fixture.data[`fw:${storageKey}`] = record as never;
    fixture.data['other:account:key'] = { preserve: true } as never;
    fixture.data['fw:archivedAccount:unrecognized'] = { preserve: 'inert ciphertext' } as never;
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: true });
    expect(archives()[0].accounts[storageKey]).toEqual(record);
    expect(fixture.data['other:account:key']).toEqual({ preserve: true });
    expect(fixture.data['fw:archivedAccount:unrecognized']).toEqual({ preserve: 'inert ciphertext' });
    expect(fixture.data[`fw:${storageKey}`]).toBeUndefined();
  });

  it('rejects a corrupt unloaded active record and preserves its bytes and password', async () => {
    const address = await native();
    fixture.data['fw:account:0x1234'] = { encoded: 'unrecognized encrypted key', meta: {} } as never;
    const original = structuredClone(fixture.data);
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: false });
    for (const [key, value] of Object.entries(original)) expect(fixture.data[key]).toEqual(value);
    expect(service.hasMasterPassword).toBe(true);
    expect(service.getPair(address)).not.toBeNull();
  });

  it('acknowledges prompt removal and clears its cached deferral only after storage succeeds', async () => {
    delete (service as unknown as { accountAccess?: unknown }).accountAccess;
    const deferred = track(service.deferLegacyPasswordMigration());
    await drain();
    expect(await deferred).toEqual({ value: true });
    expect(await service.getAccessStatus()).toHaveProperty('deferred', true);
    const resetting = track(service.resetWallet());
    await drain(false);
    expect(fixture.data['fw:legacyPasswordPrompt']).toBeDefined();
    expect(await service.getAccessStatus()).toHaveProperty('deferred', true);
    await drain();
    expect(await resetting).toEqual({ value: true });
    expect(fixture.data['fw:legacyPasswordPrompt']).toBeUndefined();
    expect(await service.getAccessStatus()).toHaveProperty('deferred', false);
  });

  it('removes public addresses only after acknowledgement and rejects admission or selection during reset', async () => {
    const mobile = keyring.createFromUri(`${PHRASE}//public`, {}, 'sr25519').address;
    const stored = track(service.saveAddress(mobile, { name: 'Public mobile', isMobile: true, wcTopic: 'public-topic' }, 'address'));
    await drain();
    expect(await stored).toHaveProperty('value');
    const reset = track(service.resetWallet());
    await drain(false);
    expect(service.getAddress(mobile)).toBeDefined();
    const newer = track(service.saveAddress(mobile, { name: 'Late public wallet' }, 'address'));
    const selection = track(service.setCurrentAccount({ address: mobile, name: 'Late choice', isMobile: true, ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate }));
    await drain();
    expect(await reset).toEqual({ value: true });
    expect(await newer).toHaveProperty('error');
    expect(await selection).toHaveProperty('error');
    expect(service.getAddress(mobile)).toBeUndefined();
    expect(fixture.data[`fw:address:${walletAddressIdentity(mobile)}`]).toBeUndefined();
    expect(service.currentAccountSubject.value).toBeNull();
  });

  it.each(['failRead', 'failSelection'] as const)('fails closed when %s prevents the reset prerequisite', async (failure) => {
    const address = await native();
    const original = structuredClone(fixture.data);
    fixture[failure] = true;
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: false });
    expect(fixture.data).toEqual(original);
    expect(service.getPair(address)).not.toBeNull();
    expect(service.hasMasterPassword).toBe(true);
  });

  it('leaves the master password, stored keys and live wallets intact when the recovery write fails', async () => {
    const address = await native();
    const snapshot = structuredClone(fixture.data);
    const pair = service.getPair(address)!;
    fixture.failWrite = true;
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: false });
    expect(fixture.data).toEqual(snapshot);
    expect(service.hasMasterPassword).toBe(true);
    expect(service.getPair(address)).toBe(pair);
  });

  it('reports failed deletion and keeps live keys available for an acknowledged retry', async () => {
    const address = await native();
    const pair = service.getPair(address)!;
    fixture.failRemove = true;
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: false });
    expect(service.hasMasterPassword).toBe(true);
    expect(service.getPair(address)).toBe(pair);
    fixture.failRemove = false;
    const retry = track(service.resetWallet());
    await drain();
    expect(await retry).toEqual({ value: true });
    expect(service.getPair(address)).toBeNull();
    expect(archives()).not.toHaveLength(0);
  });

  it('clears the selected identity durably while retaining existing TON records', async () => {
    const address = await native();
    const ton = await native('sr25519', WalletEcosystem.Ton);
    const tonRecord = structuredClone(fixture.data[`fw:ton:${ton}`]);
    const selection = track(service.setCurrentAccount({ address, name: 'Selected public wallet', ethereumAddress: '', isMobile: false, walletEcosystem: WalletEcosystem.Substrate }));
    await drain();
    expect(await selection).toHaveProperty('value');
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: true });
    expect(service.currentAccountSubject.value).toBeNull();
    expect(fixture.data['fwcurrent_account:CurrentAccountInfo']).toBeNull();
    expect(fixture.data[`fw:ton:${ton}`]).toEqual(tonRecord);
  });

  it('waits for an earlier import and archives its key before completing reset', async () => {
    const pair = keyring.createFromUri(PHRASE, {}, 'sr25519');
    const address = pair.address;
    const storageKey = accountStoreKey(pair);
    pair.lock();
    const original = AccountsStore.prototype.getAndWait;
    let release!: () => void;
    let held = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(AccountsStore.prototype, 'getAndWait').mockImplementation(async function (this: AccountsStore, key) {
      const record = await original.call(this, key);
      if (key === storageKey && !held) { held = true; await gate; }
      return record;
    });
    const importing = track(service.addAccount(PHRASE, { name: 'Imported before reset' }, WalletEcosystem.Substrate, 'sr25519'));
    await drain();
    expect(held).toBe(true);
    const resetting = track(service.resetWallet());
    try { await drain(); } finally { release(); }
    await drain();
    expect(await importing).toEqual({ value: address });
    expect(await resetting).toEqual({ value: true });
    expect(service.getPair(address)).toBeNull();
    expect(archives().some((entry) => entry.accounts[storageKey]?.meta.name === 'Imported before reset')).toBe(true);
  });
});
