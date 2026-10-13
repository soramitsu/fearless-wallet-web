import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { KeyringService } from '@extension-base/services/keyring-service';
import State from '@extension-base/background/handlers/State';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import type { CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import { WalletEcosystem } from '@/interfaces';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>, failWrite: false, holdWrite: false,
  writes: [] as (() => void)[],
  runtime: { getURL: (path: string) => path, lastError: undefined as { message: string } | undefined },
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys, callback) => callback(structuredClone(fixture.data)),
    set: (data, callback) => {
      const snapshot = structuredClone(data);
      const finish = () => {
        fixture.runtime.lastError = fixture.failWrite ? { message: 'Public selection storage failure' } : undefined;
        if (!fixture.failWrite) Object.assign(fixture.data, snapshot);
        callback();
        fixture.runtime.lastError = undefined;
      };
      if (fixture.holdWrite) fixture.writes.push(finish); else finish();
    },
  } },
} }));

const key = 'fwcurrent_account:CurrentAccountInfo';
const first = { address: '0x' + '11'.repeat(32), name: 'Public first', ethereumAddress: '', isMobile: true, walletEcosystem: WalletEcosystem.Substrate };
const second = { ...first, address: '0x' + '22'.repeat(32), name: 'Public second' };
let service: KeyringService;
let pending: Promise<unknown>[];
const observe = (result: unknown) => {
  const outcome = Promise.resolve(result).then(() => 'resolved', () => 'rejected');
  pending.push(outcome);
  return outcome;
};
function createService(current: CurrentAccountState = structuredClone(first)) {
  const service = Object.create(KeyringService.prototype) as KeyringService;
  Object.assign(service, { currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(current), selectionRevision: 0 });
  return service;
}
beforeEach(() => {
  fixture.data = { [key]: structuredClone(first) };
  fixture.failWrite = false;
  fixture.holdWrite = false;
  fixture.writes = [];
  pending = [];
  service = createService();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  fixture.failWrite = false;
  fixture.holdWrite = false;
  for (let i = 0; i < 8; i++) {
    fixture.writes.splice(0).forEach((finish) => finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('current account selection persistence', () => {
  it('publishes a changed selection only after storage acknowledgement', async () => {
    fixture.holdWrite = true;
    const result = observe(service.setCurrentAccount(second));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(service.currentAccountSubject.value).toEqual(first);
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(service.currentAccountSubject.value).toEqual(second);
  });

  it('does not report completion before a submitted selection has been saved', async () => {
    fixture.holdWrite = true;
    let done = false;
    const result = observe(Promise.resolve(service.setCurrentAccount(second)).then(() => { done = true; }));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(done).toBe(false);
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(fixture.data[key]).toEqual(second);
  });

  it('rejects failed selection storage without changing the published account, then permits retry', async () => {
    fixture.failWrite = true;
    expect(await observe(service.setCurrentAccount(second))).toBe('rejected');
    expect(service.currentAccountSubject.value).toEqual(first);
    expect(fixture.data[key]).toEqual(first);
    fixture.failWrite = false;
    await service.setCurrentAccount(second);
    const restarted = createService(null);
    await restarted.restoreCurrentAccount();
    expect(restarted.currentAccountSubject.value).toEqual(second);
  });

  it('waits for durable clearing before publishing no selected account', async () => {
    fixture.holdWrite = true;
    const result = observe(service.setCurrentAccount(null));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(service.currentAccountSubject.value).toEqual(first);
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(fixture.data[key]).toBeNull();
    expect(service.currentAccountSubject.value).toBeNull();
  });

  it('captures a caller-independent selection before the queued write starts', async () => {
    const selected = structuredClone(second);
    const result = observe(service.setCurrentAccount(selected));
    selected.name = 'Mutated public caller';
    await result;
    await new CurrentAccountStore().getAndWait('CurrentAccountInfo');
    expect(fixture.data[key]).toEqual(second);
    expect(service.currentAccountSubject.value).toEqual(second);
  });

  it('restores an explicit persisted null over a stale live selection', async () => {
    fixture.data[key] = null;
    await service.restoreCurrentAccount();
    expect(service.currentAccountSubject.value).toBeNull();
  });

  it('refuses malformed saved selection without publishing or overwriting it', async () => {
    fixture.data[key] = true;
    expect(await observe(service.restoreCurrentAccount())).toBe('rejected');
    expect(service.currentAccountSubject.value).toEqual(first);
    expect(fixture.data[key]).toBe(true);
  });

  it('defers State selection side effects and caller callback until storage acknowledgement', async () => {
    const state = { keyringService: service, poolsService: { unsubscribePools: vi.fn() }, updateServiceInfo: vi.fn() };
    const callback = vi.fn();
    fixture.holdWrite = true;
    const result = observe(State.prototype.setCurrentAccount.call(state as unknown as State, second, callback));
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(callback).not.toHaveBeenCalled();
    expect(state.poolsService.unsubscribePools).not.toHaveBeenCalled();
    expect(state.updateServiceInfo).not.toHaveBeenCalled();
    fixture.writes.shift()!();
    expect(await result).toBe('resolved');
    expect(callback).toHaveBeenCalledOnce();
    expect(state.updateServiceInfo).toHaveBeenCalledOnce();
  });
});
