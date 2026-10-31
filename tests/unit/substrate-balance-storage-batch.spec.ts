import { afterEach, expect, it, vi } from 'vitest';
import { Observable, type Subscriber } from 'rxjs';
import { APIItemState } from '@extension-base/api/types/networks';
import SubstrateBalanceService from '@extension-base/services/balance-service/SubstrateBalanceService';

afterEach(() => vi.restoreAllMocks());

// Pendulum's tokens pallet takes { XCM: id }; the wallet asks for { Token: 'USDT' }, which does not encode there.
const assets = [
  { id: 'pen', symbol: 'pen', precision: 12, type: 'normal' },
  { id: 'usdt', symbol: 'usdt', precision: 6, type: 'xcm', currencyId: '1' },
];
const encodes = (args: unknown[]) => !args.some((arg) => typeof arg === 'object' && arg !== null && 'Token' in arg);
const accountInfo = { data: { free: '1000000000000', reserved: '0', frozen: '0' } };

// Storage as @polkadot/api 16 reads it: the keys asked for in one tick go out in one request, and a key that does
// not encode fails that request for every key in it.
function batchedStorage<T>(deliver: (subscriber: T, failed: boolean) => void, create: (add: (subscriber: T) => void) => unknown) {
  let batch: { args: unknown[]; subscriber: T }[] | undefined;
  return () => Object.assign((...args: unknown[]) => create((subscriber) => {
    if (!batch) {
      const calls: { args: unknown[]; subscriber: T }[] = [];
      batch = calls;
      queueMicrotask(() => {
        batch = undefined;
        const failed = calls.some((call) => !encodes(call.args));
        calls.forEach((call) => deliver(call.subscriber, failed));
      });
    }
    batch.push({ args, subscriber });
  }), { key: (...args: unknown[]) => {
    if (!encodes(args)) throw new Error('createType(Lookup121):: Enum(Token):: Invalid character');
    return '0x00';
  } });
}

function fixture(query: Record<string, Record<string, unknown> | undefined>, rx = true) {
  const network = { name: 'Pendulum', assets };
  const setBalanceItem = vi.fn();
  const state = {
    networkService: { networkMap: { Pendulum: network }, assetsMap: assets },
    balanceService: { setBalanceItem },
    keyringService: { getSubstrateAddress: (address: string) => address },
    getSubstrateApiMap: { pendulum: { api: { query } } },
  };
  const service = new SubstrateBalanceService(state as never);
  const api = rx ? { rx: { query } } : { query };
  return { state, service, api, setBalanceItem };
}

const subscriptionEntry = batchedStorage<Subscriber<unknown>>(
  (subscriber, failed) => failed ? subscriber.error(new Error('createType(Vec<StorageKey>)')) : subscriber.next(accountInfo),
  (add) => new Observable((subscriber) => add(subscriber))
);
const readEntry = batchedStorage<{ resolve: (value: unknown) => void; reject: (error: Error) => void }>(
  (call, failed) => failed ? call.reject(new Error('createType(Vec<StorageKey>)')) : call.resolve(accountInfo),
  (add) => new Promise((resolve, reject) => add({ resolve, reject }))
);

const call = (setBalanceItem: ReturnType<typeof vi.fn>, id: string) =>
  setBalanceItem.mock.calls.find(([, item]) => item.id === id);

it('subscribes the balances a chain can encode when another asset key cannot be encoded', async () => {
  const f = fixture({ system: { account: subscriptionEntry() }, tokens: { accounts: subscriptionEntry() } });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  const unsubscribe = f.service.subscribeSubstrateAssetsBalances('wallet', 'Pendulum', f.api as never, f.state as never);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(call(f.setBalanceItem, 'pen')).toEqual(['Pendulum', expect.objectContaining({ state: APIItemState.READY }), 'wallet']);
  expect(call(f.setBalanceItem, 'usdt')).toEqual(['Pendulum', expect.objectContaining({ state: APIItemState.ERROR }), 'wallet']);
  unsubscribe();
});

it('marks an asset failed when its subscription fails instead of leaving it pending', async () => {
  const failing = Object.assign(() => new Observable((subscriber) => {
    queueMicrotask(() => subscriber.error(new Error('Too many subscriptions')));
  }), { key: () => '0x00' });
  const f = fixture({ system: { account: failing }, tokens: { accounts: failing } });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  f.service.subscribeSubstrateAssetsBalances('wallet', 'Pendulum', f.api as never, f.state as never);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(f.setBalanceItem.mock.calls.map(([, item]) => [item.id, item.state])).toEqual([
    ['pen', APIItemState.ERROR], ['usdt', APIItemState.ERROR],
  ]);
});

it('marks an asset failed when the ready chain has no pallet for it', () => {
  const f = fixture({ system: { account: subscriptionEntry() } });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  f.service.subscribeSubstrateAssetsBalances('wallet', 'Pendulum', f.api as never, f.state as never);

  expect(call(f.setBalanceItem, 'usdt')).toEqual(['Pendulum', expect.objectContaining({ state: APIItemState.ERROR }), 'wallet']);
});

it('reads the balances a chain can encode when another asset key cannot be encoded', async () => {
  const f = fixture({ system: { account: readEntry() }, tokens: { accounts: readEntry() } }, false);

  await f.service.fetchBalance({ address: 'wallet', ethereumAddress: '', networks: ['Pendulum'] }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(call(f.setBalanceItem, 'pen')).toEqual(['Pendulum', expect.objectContaining({ state: APIItemState.READY }), 'wallet']);
});
