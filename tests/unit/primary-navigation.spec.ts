import { describe, expect, it, beforeEach } from 'vitest';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import {
  clearRememberedPrimaryRoutes,
  getPrimaryStack,
  getRememberedPrimaryRoute,
  popPrimaryRoute,
  rememberPrimaryRoute,
  resolvePrimaryNavigationTarget,
} from '@/router/primaryNavigation';

const route = (
  name: string,
  destination: string,
  params: Record<string, string> = {}
) => ({
  fullPath: `/${destination}/${name}/${Object.values(params).join('/')}`,
  hash: '',
  meta: { primaryNavigation: destination },
  name,
  params,
  query: {},
}) as unknown as RouteLocationNormalizedLoaded;

describe('primary navigation history', () => {
  beforeEach(clearRememberedPrimaryRoutes);

  it('restores each tab child route independently', () => {
    rememberPrimaryRoute('wallet-a', route('AssetHistory', 'portfolio', { assetId: 'dot', selectedNetwork: 'Polkadot' }));
    rememberPrimaryRoute('wallet-a', route('Farming', 'defi'));

    expect(getRememberedPrimaryRoute('wallet-a', 'portfolio')).toMatchObject({
      name: 'AssetHistory',
      params: { assetId: 'dot', selectedNetwork: 'Polkadot' },
    });
    expect(getRememberedPrimaryRoute('wallet-a', 'defi')).toMatchObject({ name: 'Farming' });
  });

  it('does not leak a prior tab stack into another wallet', () => {
    rememberPrimaryRoute('wallet-a', route('Polkamarkt', 'defi', { marketId: '42' }));
    expect(getRememberedPrimaryRoute('wallet-b', 'defi')).toBeUndefined();
  });

  it('returns the root when the active tab is reselected', () => {
    rememberPrimaryRoute('wallet-a', route('Farming', 'defi'));

    expect(resolvePrimaryNavigationTarget('wallet-a', 'defi', 'defi', { name: 'Defi' })).toEqual({ name: 'Defi' });
  });

  it('keeps interleaved tab histories independent and pops only the active stack', () => {
    rememberPrimaryRoute('wallet-a', route('Currencies', 'portfolio'));
    rememberPrimaryRoute('wallet-a', route('AssetHistory', 'portfolio', { assetId: 'dot' }));
    rememberPrimaryRoute('wallet-a', route('Defi', 'defi'));
    rememberPrimaryRoute('wallet-a', route('Farming', 'defi'));

    // Restoring Portfolio does not append or disturb the DeFi history.
    rememberPrimaryRoute('wallet-a', route('AssetHistory', 'portfolio', { assetId: 'dot' }));

    expect(getPrimaryStack('wallet-a', 'portfolio')).toHaveLength(2);
    expect(getPrimaryStack('wallet-a', 'defi')).toHaveLength(2);
    expect(popPrimaryRoute('wallet-a', 'portfolio')).toMatchObject({ name: 'Currencies' });
    expect(getRememberedPrimaryRoute('wallet-a', 'defi')).toMatchObject({ name: 'Farming' });
  });
});
