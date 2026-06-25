import { filterNetworksByEcosystem } from '@extension-base/background/helpers/balance';
import type { NetworkJson } from '@extension-base/types';

const networkMap = {
  Bitcoin: { ecosystem: 'bitcoin' },
  Ethereum: { ecosystem: 'ethereum' },
  Moonbeam: { ecosystem: 'ethereumBased' },
  Polkadot: { ecosystem: 'substrate' },
  Solana: { ecosystem: 'solana' },
  Taira: { ecosystem: 'iroha' },
  Ton: { ecosystem: 'ton' },
} as Record<string, Pick<NetworkJson, 'ecosystem'>>;

describe('balance network ecosystem filtering', () => {
  it('keeps only requested ecosystem networks and ignores unknown names', () => {
    expect(filterNetworksByEcosystem(networkMap, ['Taira', 'Solana', 'Unknown'], ['iroha'])).toEqual(['Taira']);
    expect(filterNetworksByEcosystem(networkMap, ['Bitcoin', 'Taira', 'Unknown'], ['bitcoin'])).toEqual(['Bitcoin']);
    expect(filterNetworksByEcosystem(networkMap, ['Moonbeam', 'Polkadot', 'Ethereum'], ['substrate', 'ethereumBased'])).toEqual([
      'Moonbeam',
      'Polkadot',
    ]);
  });
});
