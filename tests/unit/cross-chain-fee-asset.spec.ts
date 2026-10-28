import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getUtilityProps } from '@extension-base/background/handlers/utils';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { REVIEWED_RUNTIMES, assertReviewedFeeAsset } from '@/cross-chain/reviewedRuntimes';

const productionRegistry = JSON.parse(
  readFileSync(resolve(__dirname, '../../remote-config/production/chains/v13/chains.json'), 'utf8')
) as NetworkJson[];

const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const DOT = { id: '887a17c7-1370-4de0-97dd-5422e294fa75', symbol: 'dot', precision: 10 };
const row = (assets: unknown[], chainId = POLKADOT) => ({ chainId, assets }) as unknown as NetworkJson;

describe('reviewed origin fee assets', () => {
  it.each(REVIEWED_RUNTIMES.map((runtime) => [runtime.name, runtime] as const))(
    'pins the %s fee asset that the production registry lists first today',
    (_name, runtime) => {
      const network = productionRegistry.find(({ chainId }) => chainId === runtime.chainId);

      expect(assertReviewedFeeAsset(runtime.chainId, network)).toEqual(runtime.feeAsset);
    }
  );

  it('pins the relay fee assets with their own precision', () => {
    expect(REVIEWED_RUNTIMES.map(({ name, feeAsset }) => [name, feeAsset.symbol, feeAsset.precision])).toEqual([
      ['Polkadot', 'DOT', 10],
      ['Kusama', 'KSM', 12],
      ['Liberland', 'LLD', 12],
      ['SORA Mainnet', 'XOR', 18],
      ['Acala', 'ACA', 12],
      ['Astar', 'ASTR', 18],
    ]);
    expect(Object.isFrozen(REVIEWED_RUNTIMES[0].feeAsset)).toBe(true);
  });

  it('accepts the registry row that confirms the pin', () => {
    expect(assertReviewedFeeAsset(POLKADOT, row([DOT]))).toEqual({ id: DOT.id, symbol: 'DOT', precision: 10 });
  });

  it.each([
    ['no registry row', undefined],
    ['a row without assets', row([])],
    ['a reordered row', row([{ id: 'usdt', symbol: 'USDT', precision: 6 }, DOT])],
    ['another fee precision', row([{ ...DOT, precision: 12 }])],
    ['another fee ticker', row([{ ...DOT, symbol: 'KSM' }])],
    ['another asset id', row([{ ...DOT, id: '887a17c7-1370-4de0-97dd-5422e294fa76' }])],
    ['the row of another chain', row([DOT], 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe')],
  ])('fails closed with %s', (_label, network) => {
    expect(() => assertReviewedFeeAsset(POLKADOT, network)).toThrow('cross_chain_fee_asset_unavailable');
  });

  it('refuses a chain without a reviewed runtime', () => {
    expect(() => assertReviewedFeeAsset('unreviewed', row([DOT], 'unreviewed'))).toThrow(
      'cross_chain_fee_asset_unavailable'
    );
  });
});

describe('utility asset of a network', () => {
  const state = (networksGithub: unknown[]) => ({ networkService: { networksGithub } }) as unknown as State;

  it('returns the first asset of the remote registry row', () => {
    expect(getUtilityProps('polkadot', state([{ name: 'Polkadot', assets: [DOT] }]))).toBe(DOT);
  });

  it('says that the registry is unavailable instead of failing on an undefined row', () => {
    expect(() => getUtilityProps('Polkadot', state([]))).toThrow('network_registry_unavailable');
  });
});
