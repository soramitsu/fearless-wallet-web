import { describe, expect, it } from 'vitest';
import { getAssetOptions } from '@extension-base/api/substrate';
import registry from '../fixtures/legacy-305/chains-v13.snapshot.json';
import type { Asset, NetworkJson } from '@extension-base/types';

const networks = registry as unknown as NetworkJson[];

describe('Pendulum and Amplitude XCM token keys', () => {
  // Checked against Pendulum's assetRegistry on 3 November 2026: XCM(0) DOT, 1 USDT, 2 USDC, 4 BRZ, 6 GLMR ... 12 USDC.axl.
  it('asks for each XCM token by the index the registry gives, never by its symbol', () => {
    for (const name of ['Pendulum', 'Amplitude']) {
      const assets = networks.find((network) => network.name === name)!.assets.filter(({ type }) => (type as string) === 'xcm');

      expect(assets.length).toBeGreaterThan(0);
      for (const asset of assets) expect(getAssetOptions(asset.id, assets as Asset[])).toEqual({ XCM: Number(asset.currencyId) });
      // One key per token.
      expect(new Set(assets.map(({ currencyId }) => currencyId)).size).toBe(assets.length);
    }

    const pendulum = networks.find((network) => network.name === 'Pendulum')!.assets as Asset[];
    const usdt = pendulum.find(({ symbol }) => symbol === 'usdt')!;
    expect(getAssetOptions(usdt.id, pendulum)).toEqual({ XCM: 1 });
  });

  it.each([undefined, '', '-1', '1.5', 'USDT', '9007199254740993'])('refuses an XCM token without a usable index (%s)', (currencyId) => {
    const asset = { id: 'xcm-token', symbol: 'usdt', type: 'xcm', currencyId } as unknown as Asset;

    expect(() => getAssetOptions(asset.id, [asset])).toThrow('Invalid XCM asset index');
  });
});
