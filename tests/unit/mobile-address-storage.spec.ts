import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { addressKey, contractKey } from '@subwallet/ui-keyring/defaults';
import type { KeyringJson, KeyringAddressType } from '@subwallet/ui-keyring/types';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, KeyringJson>,
  writes: [] as Array<() => void>,
  failRead: false,
  failWrite: false,
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => path },
}));
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys: unknown, callback: (data: typeof fixture.data) => void) => {
      fixture.runtime.lastError = fixture.failRead ? { message: 'Public address read failed' } : undefined;
      callback(structuredClone(fixture.data));
      fixture.runtime.lastError = undefined;
    },
    set: (data: typeof fixture.data, callback: () => void) => {
      const snapshot = structuredClone(data);
      fixture.writes.push(() => {
        fixture.runtime.lastError = fixture.failWrite ? { message: 'Public address write failed' } : undefined;
        if (!fixture.failWrite) Object.assign(fixture.data, snapshot);
        callback();
        fixture.runtime.lastError = undefined;
      });
    },
    remove: vi.fn(),
  } },
} }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import type { FWKeyringMeta } from '@extension-base/types';

const PASSWORD = 'Public mobile persistence password';
let service: KeyringService;
let address: string;
let pending: Promise<unknown>[];
const mobile = () => ({ name: 'Public mobile wallet', isMobile: true, wcTopic: 'public-topic', chains: ['10'] });
const storedKey = (type: KeyringAddressType = 'address') => `fw:${type === 'address' ? addressKey(address) : contractKey(address)}`;
async function drain() {
  for (let i = 0; i < 20; i++) {
    fixture.writes.splice(0).forEach((finish) => finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
function begin(meta: FWKeyringMeta = mobile(), type: KeyringAddressType = 'address') {
  const result = Promise.resolve().then(() => service.saveAddress(address, meta, type))
    .then((value) => ({ value }), (error) => ({ error }));
  pending.push(result);
  return result;
}
async function seed() {
  const result = begin();
  await drain();
  expect(await result).toHaveProperty('value');
}

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  fixture.writes = [];
  fixture.failRead = false;
  fixture.failWrite = false;
  pending = [];
  for (const subject of [keyring.accounts, keyring.addresses, keyring.contracts]) {
    for (const key of Object.keys(subject.subject.value)) subject.removeSubjectOnly(key);
  }
  vi.spyOn(keyring.keyringOption, 'init').mockImplementation(() => {});
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: new AccountsStore(),
    password_store: { get: (callback) => callback(undefined), set: () => {}, remove: () => {} },
  });
  keyring.keyring.changeMasterPassword(PASSWORD);
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: PASSWORD, tonKeyring: new TonKeyringService(service) });
  const pair = keyring.createFromUri('//Alice');
  address = pair.address;
  pair.lock();
});
afterEach(async () => {
  fixture.failWrite = false;
  fixture.failRead = false;
  await drain();
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('durable mobile address publication with installed keyring', () => {
  it('waits for storage before publishing or resolving a new address', async () => {
    let settled = false;
    const result = begin().then((outcome) => { settled = true; return outcome; });
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(keyring.getAddresses()).toEqual([]);
    expect(settled).toBe(false);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(keyring.getAddresses()).toHaveLength(1);
    expect(fixture.data[storedKey()].meta).toMatchObject(mobile());
  });

  it('rejects a failed read without writing or publishing', async () => {
    fixture.failRead = true;
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual({});
    expect(keyring.getAddresses()).toEqual([]);
  });

  it('rejects a failed first write, then permits a clean retry', async () => {
    fixture.failWrite = true;
    const failed = begin();
    await drain();
    expect(await failed).toHaveProperty('error');
    expect(keyring.getAddresses()).toEqual([]);
    fixture.failWrite = false;
    await seed();
    expect(keyring.getAddresses()).toHaveLength(1);
    await expect(BaseExtensionStore.flush()).resolves.toBeUndefined();
  });

  it('does not mutate an existing live address before rename acknowledgement', async () => {
    await seed();
    const original = structuredClone(fixture.data[storedKey()]);
    const result = begin({ name: 'Renamed public wallet' });
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(keyring.getAddress(address)?.meta.name).toBe(original.meta.name);
    expect(fixture.data[storedKey()]).toEqual(original);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(keyring.getAddress(address)?.meta.name).toBe('Renamed public wallet');
  });

  it('retains both live and durable metadata after a failed rename', async () => {
    await seed();
    const original = structuredClone(fixture.data[storedKey()]);
    fixture.failWrite = true;
    const result = begin({ name: 'Failed rename' });
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data[storedKey()]).toEqual(original);
    expect(keyring.getAddress(address)?.meta.name).toBe(original.meta.name);
  });

  it('merges with latest durable metadata and retains unknown fields', async () => {
    await seed();
    Object.assign(fixture.data[storedKey()], { futureRecord: { kept: true } });
    fixture.data[storedKey()].meta.futureLink = { network: 'public-latest' };
    const result = begin({ name: 'Durable latest rename' });
    await drain();
    expect(await result).toHaveProperty('value');
    expect(fixture.data[storedKey()]).toMatchObject({ futureRecord: { kept: true }, meta: { futureLink: { network: 'public-latest' } } });
    expect(keyring.getAddress(address)?.meta.futureLink).toEqual({ network: 'public-latest' });
  });

  it('refuses a mismatched identity stored under the address key', async () => {
    const other = keyring.createFromUri('//Bob');
    fixture.data[storedKey()] = { address: other.address, meta: { name: 'Preserve malformed old record' } };
    other.lock();
    const before = structuredClone(fixture.data);
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(before);
    expect(keyring.getAddresses()).toEqual([]);
  });

  it('keeps address and contract records separate when updating the same identity', async () => {
    await seed();
    const addressRecord = structuredClone(fixture.data[storedKey()]);
    const result = begin({ name: 'Public contract', contract: { abi: 'public', genesisHash: null } }, 'contract');
    await drain();
    expect(await result).toHaveProperty('value');
    expect(fixture.data[storedKey()]).toEqual(addressRecord);
    expect(fixture.data[storedKey('contract')].meta).not.toHaveProperty('wcTopic');
    expect(keyring.getContract(address)?.meta.name).toBe('Public contract');
  });
});
