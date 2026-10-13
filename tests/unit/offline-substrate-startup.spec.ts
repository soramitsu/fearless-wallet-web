import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import SubstrateBalanceService from '@extension-base/services/balance-service/SubstrateBalanceService';
import { SubstrateApiHandler } from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import { readSnapshot } from '../fixtures/legacy-305/generate';

const readiness = vi.hoisted(() => ({ reject: undefined as undefined | ((error: Error) => void) }));
vi.mock('@polkadot/api', () => ({ ApiPromise: class {
  isReadyOrError = new Promise((_, reject) => { readiness.reject = reject; });
  on() {}
} }));
vi.mock('@polkadot/rpc-provider', () => ({ WsProvider: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SoraApiHandler', () => ({ SoraApiHandler: class {} }));

describe('offline Substrate initialization', () => {
  afterEach(() => vi.restoreAllMocks());

  it('can read cached network metadata without a remote registry response', async () => {
    const network = readSnapshot().find(({ name }) => name === 'Polkadot')!;
    const setBalanceItem = vi.fn();
    const state = {
      networkService: { networksGithub: [], networkMap: { Polkadot: network }, assetsMap: network.assets },
      getSubstrateApiMap: {}, balanceService: { setBalanceItem },
    };
    const service = new SubstrateBalanceService(state as never);
    await expect(service.fetchBalance({ address: 'owner', ethereumAddress: '', networks: ['Polkadot'] })).resolves.toBeDefined();
    expect(setBalanceItem).not.toHaveBeenCalled();
    expect(() => service.subscribeSubstrateAssetsBalances('owner', 'Polkadot', {} as never, state as never)).not.toThrow();
  });

  it('owns the readiness rejection for a connection which never becomes ready', async () => {
    const network = readSnapshot().find(({ name }) => name === 'Polkadot')!;
    const handler = new SubstrateApiHandler({} as never, {} as never);
    await handler.initApi(network);
    readiness.reject!(new Error('offline websocket'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handler.api.polkadot.apiStatus).toBe(NETWORK_STATUS.DISCONNECTED);
  });
});
