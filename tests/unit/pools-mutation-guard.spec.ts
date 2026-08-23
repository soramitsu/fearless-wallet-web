import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { api as apiSora } from '@sora-substrate/util';
import { PoolsService } from '@extension-base/services/pools-service';
import type State from '@extension-base/background/handlers/State';
import type { MakePoolsRequest } from '@extension-base/services/pools-service/types';
import { SORA_NETWORK_NAME } from '@/consts/sora';

const request = {
  params: {
    amount1: '1',
    amount2: '1',
    assetId1: 'xor-group',
    assetId2: 'val-group',
    expectedFee: '0.01',
    isExchangeB: false,
    isMobile: false,
    networkName: SORA_NETWORK_NAME,
    slippage: 0.5,
  },
  type: 'addLiquidity',
} as MakePoolsRequest;

describe('PoolsService mutation boundary', () => {
  it('fails closed before touching the runtime when Polkaswap actions are disabled', async () => {
    const isActionEnabled = vi.fn().mockReturnValue(false);
    const state = {
      actionCapabilityService: { isActionEnabled },
      soraDisclaimerService: { isAccepted: vi.fn().mockReturnValue(false) },
      getSubstrateApiMap: new Proxy({}, { get: () => { throw new Error('runtime must not be read'); } }),
    } as unknown as State;

    await expect(new PoolsService(state).makePool(request)).resolves.toEqual({
      status: false,
      errors: [expect.objectContaining({ message: 'Polkaswap liquidity actions are temporarily unavailable.' })],
    });
    expect(isActionEnabled).toHaveBeenCalledWith('polkaswap');
  });

  it('rejects a missing runtime without executing liquidity methods', async () => {
    const soraRoot = apiSora as unknown as { account?: unknown };
    const previousAccount = soraRoot.account;
    const address = 'selected-sora-account';
    soraRoot.account = { pair: { address, meta: {} } };
    const state = {
      actionCapabilityService: { isActionEnabled: vi.fn().mockReturnValue(true) },
      getSubstrateApiMap: {},
      getAccountAddress: vi.fn().mockReturnValue(address),
      soraDisclaimerService: { isAccepted: vi.fn().mockReturnValue(true) },
    } as unknown as State;

    try {
      await expect(new PoolsService(state).makePool(request)).resolves.toEqual({
        status: false,
        errors: [expect.objectContaining({ message: 'The SORA runtime is unavailable.' })],
      });
    } finally {
      soraRoot.account = previousAccount;
    }
  });

  it('requires the background-owned disclaimer record before reading the runtime', async () => {
    const state = {
      actionCapabilityService: { isActionEnabled: vi.fn().mockReturnValue(true) },
      getSubstrateApiMap: new Proxy({}, { get: () => { throw new Error('runtime must not be read'); } }),
      soraDisclaimerService: { isAccepted: vi.fn().mockReturnValue(false) },
    } as unknown as State;

    await expect(new PoolsService(state).makePool(request)).resolves.toEqual({
      status: false,
      errors: [expect.objectContaining({ message: 'Accept the Polkaswap risk disclaimer first.' })],
    });
  });

  it('applies the same kill-switch boundary to direct add and remove calls', async () => {
    const state = {
      actionCapabilityService: { isActionEnabled: vi.fn().mockReturnValue(false) },
      soraDisclaimerService: { isAccepted: vi.fn().mockReturnValue(true) },
      getSubstrateApiMap: new Proxy({}, { get: () => { throw new Error('runtime must not be read'); } }),
    } as unknown as State;
    const service = new PoolsService(state);

    await expect(service.addLiquidity(request.params as never)).resolves.toEqual({
      status: false,
      errors: [expect.objectContaining({ message: 'Polkaswap liquidity actions are temporarily unavailable.' })],
    });
    await expect(service.removeLiquidity(request.params as never)).resolves.toEqual({
      status: false,
      errors: [expect.objectContaining({ message: 'Polkaswap liquidity actions are temporarily unavailable.' })],
    });
  });

  it('fails closed on a stale or absent SORA signer before consulting the runtime', async () => {
    const state = {
      actionCapabilityService: { isActionEnabled: vi.fn().mockReturnValue(true) },
      soraDisclaimerService: { isAccepted: vi.fn().mockReturnValue(true) },
      getAccountAddress: vi.fn().mockReturnValue('selected-sora-account'),
      getSubstrateApiMap: new Proxy({}, { get: () => { throw new Error('runtime must not be read'); } }),
    } as unknown as State;

    await expect(new PoolsService(state).addLiquidity(request.params as never)).resolves.toEqual({
      status: false,
      errors: [expect.objectContaining({ message: 'A locally signable SORA account is required.' })],
    });
  });

  it('selects pool details by canonical asset keys rather than ticker text', () => {
    const list = readFileSync(resolve(__dirname, '../../src/screens/pools/PoolsPage.vue'), 'utf8');
    const details = readFileSync(resolve(__dirname, '../../src/screens/pools/PoolDetails.vue'), 'utf8');

    expect(list).toContain('asset1Key: poolParams.asset1.assetKey');
    expect(list).toContain('asset2Key: poolParams.asset2.assetKey');
    expect(details).toContain('asset1.assetKey === asset1Key && asset2.assetKey === asset2Key');
    expect(details).not.toContain('isSameString(asset1.name');
  });
});
