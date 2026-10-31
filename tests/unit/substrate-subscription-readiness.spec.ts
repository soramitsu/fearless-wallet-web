import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SubstrateBalanceService from '@extension-base/services/balance-service/SubstrateBalanceService';
import type State from '@extension-base/background/handlers/State';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

function fixture(name = 'polkadot', api?: { isReadyOrError: Promise<unknown> }) {
  const entry = { api };
  const state = {
    getSubstrateApiMap: { [name]: entry },
    networkService: { networkMap: { [name]: { name, networkStatus: 'connecting' } } },
  };
  const service = new SubstrateBalanceService(state as unknown as State);
  const unsub = vi.fn();
  const subscribe = vi.spyOn(service, 'subscribeSubstrateAssetsBalances').mockReturnValue(unsub);
  const run = (address = 'wallet-a', isCurrent = () => true) => service.subscribeSubstrateBalances(
    { address, ethereumAddress: '', substrateNetworks: [name] }, state as unknown as State, isCurrent
  )[0];
  return { state, entry, service, unsub, subscribe, run };
}

it('resolves empty account setup immediately without leaving timers or subscriptions', async () => {
  const f = fixture();
  await expect(f.run('')).resolves.toMatchObject({ networkName: 'polkadot' });
  expect(vi.getTimerCount()).toBe(0);
  expect(f.subscribe).not.toHaveBeenCalled();
});

it.each(['polkadot', 'sora'])('bounds a missing %s API at sixty seconds', async (name) => {
  const f = fixture(name);
  const pending = f.run();
  await vi.advanceTimersByTimeAsync(60_000);
  await expect(pending).resolves.toMatchObject({ networkName: name });
  expect(f.subscribe).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not attach when a readiness promise resolves after its deadline', async () => {
  let ready!: () => void;
  const f = fixture('polkadot', { isReadyOrError: new Promise<void>((resolve) => { ready = resolve; }) });
  const pending = f.run();
  await vi.advanceTimersByTimeAsync(60_000);
  await pending;
  ready();
  await Promise.resolve();
  expect(f.subscribe).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('abandons a removed connection while readiness is pending', async () => {
  let ready!: () => void;
  const f = fixture('polkadot', { isReadyOrError: new Promise<void>((resolve) => { ready = resolve; }) });
  const pending = f.run();
  await vi.advanceTimersByTimeAsync(1000);
  delete f.state.getSubstrateApiMap.polkadot;
  ready();
  await pending;
  expect(f.subscribe).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not attach a superseded account subscription', async () => {
  let current = true;
  const f = fixture('polkadot', { isReadyOrError: Promise.resolve() });
  const pending = f.run('wallet-a', () => current);
  current = false;
  await vi.advanceTimersByTimeAsync(1000);
  await pending;
  expect(f.subscribe).not.toHaveBeenCalled();
});

it('attaches the ready API once and clears readiness timers', async () => {
  const api = { isReadyOrError: Promise.resolve() };
  const f = fixture('polkadot', api);
  const pending = f.run();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await pending).unsub).toBe(f.unsub);
  expect(f.subscribe).toHaveBeenCalledExactlyOnceWith('wallet-a', 'polkadot', api, f.state);
  expect(vi.getTimerCount()).toBe(0);
});

it('settles a rejected readiness promise without retrying or overwriting cached balances', async () => {
  let reject!: (error: Error) => void;
  const f = fixture('polkadot', { isReadyOrError: new Promise((_resolve, fail) => { reject = fail; }) });
  const pending = f.run();
  await vi.advanceTimersByTimeAsync(1000);
  reject(new Error('offline'));
  await pending;
  expect(f.subscribe).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
