import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';
import { addressKey } from '@subwallet/ui-keyring/defaults';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, KeyringPairJson & { accounts: Record<string, KeyringPairJson>; ton: TonStoreAccount; cipherSeed: string; pendingCipherSeed?: string }>,
  writes: [] as Array<() => void>,
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
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { WalletConnectDAppService } from '@extension-base/services/wallet-connect-service/dapp';
import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { accountStoreKey, walletRecordKeys } from '@extension-base/services/keyring-service/DeletedWallets';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import State from '@extension-base/background/handlers/State';
import { decryptTonSeed } from '@extension-base/services/keyring-service/TonSeedVault';
import Extension from '@extension-base/background/handlers/Extension';
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
async function mobile() {
  const pair = keyring.createFromUri('//Alice//removal-storage');
  const address = pair.address;
  pair.lock();
  const result = track(service.saveAddress(address, { name: 'Public mobile', isMobile: true, wcTopic: 'public-remove-topic' }, 'address'));
  await drain();
  expect(await result).toHaveProperty('value');
  return address;
}
const archives = () => Object.entries(fixture.data).filter(([key]) => key.startsWith('fw:deletedWallet:')).map(([, value]) => value);

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  fixture.writes = [];
  fixture.removals = [];
  fixture.failRead = fixture.failWrite = fixture.failRemove = fixture.failSelection = false;
  pending = [];
  for (const subject of [keyring.accounts, keyring.addresses, keyring.contracts]) {
    for (const address of Object.keys(subject.subject.value)) subject.removeSubjectOnly(address);
  }
  vi.spyOn(keyring.keyringOption, 'init').mockImplementation(() => {});
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: new AccountsStore(),
    password_store: { get: (callback) => callback(undefined), set: () => {}, remove: () => {} },
  });
  keyring.keyring.changeMasterPassword(PASSWORD);
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: PASSWORD, tonKeyring: new TonKeyringService(service),
    currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0,
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn() }, scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  fixture.failRead = fixture.failWrite = fixture.failRemove = fixture.failSelection = false;
  await drain();
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

function handler() {
  const state = Object.create(State.prototype) as State;
  Object.assign(state, {
    keyringService: service,
    requestService: { mutateAuthorizations: async (mutate: (auth: object) => void) => mutate({}) },
    walletConnectService: { removeSessions: vi.fn().mockResolvedValue(undefined), invalidateSession: vi.fn() },
    walletConnectDappService: { disconnect: vi.fn().mockResolvedValue(undefined) },
    poolsService: { unsubscribePools: vi.fn() }, updateServiceInfo: vi.fn(),
    balanceService: { generateDefaultBalance: vi.fn() }, networkService: { selectedNetworks: {} },
    nftService: { publishNfts: vi.fn() }, setActiveNetworks: vi.fn(), cleanupDeletedAccount: vi.fn(),
  });
  vi.spyOn(service, 'triggerWalletsSubscription').mockImplementation(() => {});
  const extension = Object.create(Extension.prototype) as Extension;
  Object.assign(extension, { state });
  return { state, extension };
}
async function select(address: string) {
  const { state } = handler();
  const result = track(state.updateCurrentAccount({ address }));
  await drain();
  expect(await result).toHaveProperty('value');
  return state.currentAccount!;
}

describe('acknowledged wallet removal with actual keyring and Chrome storage', { timeout: 60_000 }, () => {
  it('retains a mobile address and pending result until removal is acknowledged', async () => {
    const address = await mobile();
    let settled = false;
    const result = track(service.forgetAddress(address)).then((outcome) => { settled = true; return outcome; });
    await drain(false);
    expect(fixture.removals).toHaveLength(1);
    expect(settled).toBe(false);
    expect(service.getAddress(address)).toBeDefined();
    await drain();
    expect(await result).toHaveProperty('value');
    expect(service.getAddress(address)).toBeUndefined();
    expect(fixture.data[`fw:${addressKey(address)}`]).toBeUndefined();
  });

  it('rejects failed mobile removal, retains the live record and permits retry', async () => {
    const address = await mobile();
    fixture.failRemove = true;
    const result = track(service.forgetAddress(address));
    await drain();
    expect(await result).toHaveProperty('error');
    expect(service.getAddress(address)).toBeDefined();
    expect(fixture.data[`fw:${addressKey(address)}`]).toBeDefined();
    fixture.failRemove = false;
    const retry = track(service.forgetAddress(address));
    await drain();
    expect(await retry).toHaveProperty('value');
    expect(service.getAddress(address)).toBeUndefined();
  });

  it.each(['sr25519', 'ecdsa', 'ethereum'] as const)('keeps %s keys live until acknowledged, with an exact recovery copy first', async (type) => {
    const address = await native(type);
    const pair = service.getPair(address)!;
    const key = accountStoreKey(pair);
    const original = structuredClone(fixture.data[`fw:${key}`]);
    let settled = false;
    const result = track(service.forgetAccount(address)).then((outcome) => { settled = true; return outcome; });
    await drain(false);
    expect(fixture.removals).toHaveLength(1);
    expect(settled).toBe(false);
    expect(service.getPair(address)).toBe(pair);
    expect(archives().some((wallet) => JSON.stringify(wallet.accounts[key]) === JSON.stringify(original))).toBe(true);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(service.getPair(address)).toBeNull();
    expect(fixture.data[`fw:${key}`]).toBeUndefined();
    const copy = archives().find((wallet) => wallet.accounts[key])!.accounts[key];
    const restored = keyring.createFromJson(copy);
    restored.decodePkcs8(PASSWORD);
    const payload = new TextEncoder().encode('Public removal recovery proof');
    expect(restored.verify(payload, restored.sign(payload), restored.publicKey)).toBe(true);
    restored.lock();
  });

  it('does not delete anything if archiving fails', async () => {
    const address = await native();
    const pair = service.getPair(address);
    const original = structuredClone(fixture.data);
    fixture.failWrite = true;
    const result = track(service.forgetAccount(address));
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(original);
    expect(service.getPair(address)).toBe(pair);
  });

  it('retains live native keys when removal fails after archiving', async () => {
    const address = await native();
    const pair = service.getPair(address)!;
    fixture.failRemove = true;
    const result = track(service.forgetAccount(address));
    await drain();
    expect(await result).toHaveProperty('error');
    expect(service.getPair(address)).toBe(pair);
    expect(archives()[0].accounts[accountStoreKey(pair)]).toEqual(fixture.data[`fw:${accountStoreKey(pair)}`]);
  });

  it('archives and removes all primary, linked EVM and legacy ECDSA records in one removal call', async () => {
    const address = await native('ecdsa');
    const linked = await native('ethereum');
    const saved = track(service.saveAccountMeta(address, { ethereumAddress: linked }));
    await drain();
    expect(await saved).toHaveProperty('value');
    const pairs = [service.getPair(address)!, service.getPair(linked)!];
    const keys = walletRecordKeys(pairs);
    for (const key of keys) fixture.data[`fw:${key}`] ??= structuredClone(fixture.data[`fw:${accountStoreKey(pairs[0])}`]);
    const original = Object.fromEntries(keys.map((key) => [key, structuredClone(fixture.data[`fw:${key}`])]));
    const result = track(service.forgetAccount(address));
    await drain(false);
    expect(fixture.removals).toHaveLength(1);
    expect(fixture.removals[0].keys.sort()).toEqual(keys.map((key) => `fw:${key}`).sort());
    expect(archives()[0].accounts).toEqual(original);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(service.getPair(address)).toBeNull();
    expect(service.getPair(linked)).toBeNull();
  });

  it('preserves the TON subject snapshot and both ciphertext copies on failed removal', async () => {
    const address = await native('sr25519', WalletEcosystem.Ton);
    const previous = service.tonKeyring.accountSubject.value;
    const original = structuredClone(fixture.data[`fw:ton:${address}`]);
    fixture.data[`fw:ton:${address}`].pendingCipherSeed = original.cipherSeed;
    fixture.failRemove = true;
    const result = track(service.forgetAccount(address));
    await drain();
    expect(await result).toHaveProperty('error');
    expect(previous[address]).toBeDefined();
    expect(service.tonKeyring.accountSubject.value[address]).toBe(previous[address]);
    expect(archives()[0].ton).toEqual({ ...original, pendingCipherSeed: original.cipherSeed });
  });

  it('awaits actual mobile removal in the message handler before cleanup or success', async () => {
    const address = await mobile();
    const cleanup = vi.fn();
    const extension = Object.create(Extension.prototype);
    Object.assign(extension, { state: { keyringService: service, currentAccount: null,
      requestService: { mutateAuthorizations: async (mutate: (auth: object) => void) => mutate({}) },
      walletConnectDappService: { disconnect: vi.fn().mockResolvedValue(undefined) }, cleanupDeletedAccount: cleanup } });
    let settled = false;
    const result = track(extension.accountsForget({ address, type: 'mobile' })).then((outcome) => { settled = true; return outcome; });
    await drain(false);
    expect(fixture.removals).toHaveLength(1);
    expect(settled).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
    await drain();
    expect(await result).toEqual({ value: true });
    expect(cleanup).toHaveBeenCalledWith(address);
  });
  it('snapshots the latest acknowledged metadata and prevents a queued rename from resurrecting the account', async () => {
    const address = await native();
    const key = accountStoreKey(service.getPair(address)!);
    const rename = track(service.saveAccountMeta(address, { name: 'Latest durable name' }));
    const removal = track(service.forgetAccount(address));
    await drain(false);
    expect(await rename).toHaveProperty('value');
    expect(archives()[0].accounts[key].meta.name).toBe('Latest durable name');
    const stale = track(service.saveAccountMeta(address, { name: 'Too late' }));
    await drain();
    expect(await removal).toHaveProperty('value');
    await stale;
    expect(fixture.data[`fw:${key}`]).toBeUndefined();
    expect(service.getPair(address)).toBeNull();
  });

  it('rejects a failed recovery read without removing or changing live keys', async () => {
    const address = await native();
    const pair = service.getPair(address);
    const original = structuredClone(fixture.data);
    fixture.failRead = true;
    const result = track(service.forgetAccount(address));
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(original);
    expect(service.getPair(address)).toBe(pair);
  });

  it('removes TON only after acknowledgement, preserves old observable snapshots and verifies the recovery phrase', async () => {
    const address = await native('sr25519', WalletEcosystem.Ton);
    const previous = service.tonKeyring.accountSubject.value;
    const result = track(service.forgetAccount(address));
    await drain(false);
    expect(service.tonKeyring.accountSubject.value[address]).toBe(previous[address]);
    expect(archives()[0].ton).toEqual(fixture.data[`fw:ton:${address}`]);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(previous[address]).toBeDefined();
    expect(service.tonKeyring.accountSubject.value[address]).toBeUndefined();
    expect(await decryptTonSeed(archives()[0].ton.cipherSeed, PASSWORD, previous[address].publicKey)).toBe(PHRASE);
  });

  it('does not remove a current wallet when clearing its durable selection fails', async () => {
    const address = await native();
    const original = await select(address);
    const { state, extension } = handler();
    fixture.failSelection = true;
    const result = track(extension.accountsForget({ address, type: 'native' }));
    await drain();
    expect(await result).toEqual({ value: false });
    expect(state.currentAccount).toEqual(original);
    expect(service.getPair(address)).not.toBeNull();
    expect(archives()).toEqual([]);
    expect(state.cleanupDeletedAccount).not.toHaveBeenCalled();
  });

  it('clears the real State selection before removal and rejects reselection while removal is pending', async () => {
    const address = await native();
    const original = await select(address);
    const { state, extension } = handler();
    const result = track(extension.accountsForget({ address, type: 'native' }));
    await drain(false);
    expect(state.currentAccount).toBeNull();
    expect(fixture.data['fwcurrent_account:CurrentAccountInfo']).toBeNull();
    expect(service.getPair(address)).not.toBeNull();
    expect(await track(service.setCurrentAccount(original))).toHaveProperty('error');
    expect(await track(service.setCurrentAccount({ ...original, address: encodeAddress(address, 0) }))).toHaveProperty('error');
    await drain();
    expect(await result).toEqual({ value: true });
    expect(service.getPair(address)).toBeNull();
  });

  it('does not replace a newer explicit choice with the deletion fallback', async () => {
    const address = await native();
    const other = await mobile();
    await select(address);
    const { state, extension } = handler();
    const result = track(extension.accountsForget({ address, type: 'native' }));
    await drain(false);
    const choice = track(state.updateCurrentAccount({ address: other }));
    await drain();
    expect(await result).toEqual({ value: true });
    expect(await choice).toHaveProperty('value');
    expect(state.currentAccount?.address).toBe(other);
    expect(fixture.data['fwcurrent_account:CurrentAccountInfo'].address).toBe(other);
  });

  it('rejects a selection already queued before removal starts, with durable compensation', async () => {
    const address = await native();
    const original = await select(address);
    const queued = track(service.setCurrentAccount(original));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    const { state, extension } = handler();
    const result = track(extension.accountsForget({ address, type: 'native' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await drain();
    expect(await queued).toHaveProperty('error');
    expect(await result).toEqual({ value: true });
    expect(state.currentAccount).toBeNull();
    expect(fixture.data['fwcurrent_account:CurrentAccountInfo']).toBeNull();
  });

  it('rejects removal if a linked wallet changes while permission revocation is awaiting storage', async () => {
    const address = await native('ecdsa');
    const linked = await native('ethereum');
    const { state, extension } = handler();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const mutate = vi.spyOn(state.requestService, 'mutateAuthorizations').mockImplementation(async () => { await gate; return {}; });
    const result = track(extension.accountsForget({ address, type: 'native' }));
    await vi.waitFor(() => expect(mutate).toHaveBeenCalled());
    const rename = track(service.saveAccountMeta(address, { ethereumAddress: linked }));
    await drain();
    expect(await rename).toHaveProperty('value');
    release();
    await drain();
    expect(await result).toEqual({ value: false });
    expect(service.getPair(address)).not.toBeNull();
    expect(service.getPair(linked)).not.toBeNull();
    expect(state.cleanupDeletedAccount).not.toHaveBeenCalled();
    expect(archives()).toEqual([]);
  });

  it('revokes a standalone primary EVM site grant regardless of address case', async () => {
    const address = await native('ethereum');
    const { state, extension } = handler();
    const urls = { public: { authorizedAccounts: [], evmAuthorizedAccount: `0x${address.slice(2).toUpperCase()}` } };
    vi.spyOn(state.requestService, 'mutateAuthorizations').mockImplementation(async (mutate) => { mutate(urls as never); return urls as never; });
    const result = track(extension.accountsForget({ address, type: 'native' }));
    await drain();
    expect(await result).toEqual({ value: true });
    expect(urls.public.evmAuthorizedAccount).toBe('');
  });

  it.each([false, true])('clears saved SS58-alias mobile context and applies deletion fallback (remaining wallet: %s)', async (withFallback) => {
    const fallback = withFallback ? await native() : undefined;
    const address = await mobile();
    const selected = await select(address);
    const { state } = handler();
    const alias = encodeAddress(address, 0);
    expect(alias).not.toBe(address);
    const saving = track(state.setCurrentAccount({ ...selected, address: alias }));
    await drain();
    expect(await saving).toHaveProperty('value');
    expect(fixture.data['fwcurrent_account:CurrentAccountInfo']).toHaveProperty('address', alias);
    vi.mocked(state.poolsService.unsubscribePools).mockClear();
    const dapp = Object.create(WalletConnectDAppService.prototype);
    Object.assign(dapp, { state, invalidateSession: vi.fn() });
    const result = track(dapp.onSessionDelete({ topic: 'public-remove-topic' }));
    await drain();
    expect(await result).toHaveProperty('value');
    expect(state.poolsService.unsubscribePools).toHaveBeenCalled();
    expect(state.currentAccount?.address).toBe(fallback);
    expect(fixture.data['fwcurrent_account:CurrentAccountInfo']).toEqual(state.currentAccount);
    expect(service.getAddress(address)).toBeUndefined();
    expect(state.cleanupDeletedAccount).toHaveBeenCalledWith(address);
  });

  it('does not clear a rebound mobile wallet when an obsolete session deletion waits in the vault queue', async () => {
    const address = await mobile();
    const { state } = handler();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const blocker = track(service.tonKeyring.vault.exclusive(() => gate));
    const dapp = Object.create(WalletConnectDAppService.prototype);
    Object.assign(dapp, { state, invalidateSession: vi.fn() });
    const forgetting = vi.spyOn(service, 'forgetAddress');
    const result = track(dapp.onSessionDelete({ topic: 'public-remove-topic' }));
    await drain(false);
    expect(forgetting).toHaveBeenCalled();
    const rebind = track(service.saveAddress(address, { wcTopic: 'public-rebound-topic' }, 'address'));
    await drain();
    expect(await rebind).toHaveProperty('value');
    const selected = await select(address);
    expect(selected.wcTopic).toBe('public-rebound-topic');
    release();
    await drain();
    await blocker;
    expect(await result).toHaveProperty('error');
    expect(state.currentAccount).toEqual(selected);
    expect(fixture.data['fwcurrent_account:CurrentAccountInfo']).toEqual(selected);
    expect(service.getAddress(address)?.meta.wcTopic).toBe('public-rebound-topic');
    expect(state.cleanupDeletedAccount).not.toHaveBeenCalled();
  });

});


describe('standalone Ethereum account presentation', () => {
  it('exposes an unlinked encrypted Ethereum import with its own identity without rewriting storage', async () => {
    const pair = keyring.createFromUri(PHRASE, { name: 'Legacy Ethereum' }, 'ethereum');
    const json = pair.toJson(PASSWORD);
    const installed = keyring.keyring.addFromJson(json);
    keyring.accounts.add({ all() {}, get() {}, remove() {}, set() {} }, installed.address, installed.publicKey, json, installed.type);
    const before = structuredClone(fixture.data);
    const { extension } = handler();
    const rows = extension.convertAccounts(service.accountSubject.value);
    expect(rows).toMatchObject([{ address: pair.address, ethereumAddress: pair.address, walletEcosystem: WalletEcosystem.Evm, name: 'Legacy Ethereum' }]);
    expect(fixture.data).toEqual(before);
    expect(keyring.getAccount(pair.address)?.meta.ethereumAddress).toBeUndefined();
  });

  it('still groups a linked Ethereum child with its Substrate parent', async () => {
    const child = keyring.createFromUri(PHRASE, {}, 'ethereum');
    const parent = keyring.createFromUri(PHRASE, { ethereumAddress: child.address });
    for (const pair of [parent, child]) {
      const json = pair.toJson(PASSWORD);
      const installed = keyring.keyring.addFromJson(json);
      keyring.accounts.add({ all() {}, get() {}, remove() {}, set() {} }, installed.address, installed.publicKey, json, installed.type);
    }
    const { extension } = handler();
    const rows = extension.convertAccounts(service.accountSubject.value);
    expect(rows.map((row) => row.address)).toEqual([parent.address]);
    expect(rows[0].ethereumAddress).toBe(child.address);
  });
});
