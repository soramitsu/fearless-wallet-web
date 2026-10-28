import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NetworkJson } from '@extension-base/types';
import { BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES } from '@/cross-chain/reviewedRoutes';

const repository = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const bundledPairs = [
  ...new Set(BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.map(({ originChainId, destinationChainId }) => `${originChainId}>${destinationChainId}`)),
].sort();

const xcmPairs = (path: string) =>
  (JSON.parse(repository(path)) as NetworkJson[]).flatMap((network) =>
    network.xcm ? network.xcm.availableDestinations.map(({ chainId }) => `${network.chainId}>${chainId}`) : []
  );

describe('remote chain lists and the bundled cross-chain routes', () => {
  it('validates remote xcm blocks against exactly the bundled route pairs', () => {
    const block = /BUNDLED_ROUTE_PAIRS = frozenset\(\{([\s\S]*?)\}\)/.exec(repository('scripts/verify-remote-config.py'))?.[1] ?? '';
    const validatorPairs = [...block.matchAll(/\("([0-9a-f]{64})",\s*"([0-9a-f]{64})"\)/g)].map(
      ([, origin, destination]) => `${origin}>${destination}`
    );

    expect(validatorPairs.sort()).toEqual(bundledPairs);
  });

  it.each(['remote-config/production/chains/v13/chains.json', 'remote-config/development/chains/v13/chains_dev.json'])(
    'lists xcm destinations in %s only for the bundled routes',
    (path) => {
      expect([...new Set(xcmPairs(path))].sort()).toEqual(bundledPairs);
    }
  );

  it('keeps the remote config trust root owned by the security team alone', () => {
    const owners = repository('.github/CODEOWNERS')
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter(([pattern]) => pattern?.startsWith('/remote-config/'));

    expect(owners).toEqual([
      ['/remote-config/production/chains/', '@soramitsu/security'],
      ['/remote-config/production/appConfigs/', '@soramitsu/security'],
    ]);
  });
});
