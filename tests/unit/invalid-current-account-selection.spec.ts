import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  unreadable: [] as string[],
  runtime: { getURL: (path: string) => path, lastError: undefined as { message: string } | undefined },
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (keys: string[], callback: (data: Record<string, unknown>) => void) => {
      fixture.runtime.lastError = keys?.some((name) => fixture.unreadable.includes(name)) ? { message: 'Public read failure' } : undefined;
      callback(structuredClone(fixture.data));
      fixture.runtime.lastError = undefined;
    },
    set: (data: Record<string, unknown>, callback: () => void) => { Object.assign(fixture.data, structuredClone(data)); callback(); },
  } },
} }));

import { KeyringService } from '@extension-base/services/keyring-service';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import { WalletEcosystem } from '@/interfaces';

const key = 'fwcurrent_account:CurrentAccountInfo';
const policyKey = 'fwWalletConnect:retiredTopics';
const wallet = { address: '0x' + '22'.repeat(32), name: 'Public wallet', ethereumAddress: '', isMobile: false, walletEcosystem: WalletEcosystem.Substrate };
const mobile = { ...wallet, address: '0x' + '33'.repeat(32), isMobile: true, wcTopic: 'public-mobile-topic' };

function createService() {
  const service = Object.create(KeyringService.prototype) as KeyringService;
  Object.assign(service, { currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0 });
  return service;
}

beforeEach(() => {
  fixture.data = {};
  fixture.unreadable = [];
});
afterEach(async () => {
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('a stored selection that fails the shape check', () => {
  it.each([
    ['a 2.x selection without an address', { ethereumAddress: '0x' + '11'.repeat(20) }],
    ['an empty address', { address: '', name: '', ethereumAddress: '', isMobile: false }],
    ['a value that is not a selection', true],
  ])('selects nothing and leaves the record until a new choice: %s', async (_label, stored) => {
    fixture.data[key] = structuredClone(stored);
    const service = createService();

    await expect(service.restoreCurrentAccount()).resolves.toBeUndefined();
    expect(service.currentAccountSubject.value).toBeNull();
    expect(fixture.data[key]).toEqual(stored);

    await service.setCurrentAccount(wallet);
    expect(service.currentAccountSubject.value).toEqual(wallet);
    expect(fixture.data[key]).toEqual(wallet);
  });

  it.each([
    ['cannot be parsed', [] as string[]],
    ['cannot be read', [policyKey]],
  ])('selects nothing for a mobile wallet whose session retirement record %s', async (_label, unreadable) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const policy = { version: 2, topics: 'public' };
    fixture.data = { [key]: structuredClone(mobile), [policyKey]: structuredClone(policy) };
    fixture.unreadable = unreadable;
    const service = createService();

    await expect(service.restoreCurrentAccount()).resolves.toBeUndefined();
    expect(service.currentAccountSubject.value).toBeNull();
    expect(fixture.data[key]).toEqual(mobile);
    expect(fixture.data[policyKey]).toEqual(policy);
  });

  it('still rejects a failed selection read, so start-up reads again', async () => {
    fixture.data = { [key]: structuredClone(wallet) };
    fixture.unreadable = [key];

    await expect(createService().restoreCurrentAccount()).rejects.toThrow('Public read failure');
  });
});
