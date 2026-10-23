import type { ChainNftState, NftCollection } from '@extension-base/services/nft-service/types';
import type { NetworkJson } from '@extension-base/types';
import {
  buildAvailableNftKey,
  buildNftCollectionKey,
  buildNftNetworkSections,
  findNftCollection,
} from '@/portfolio/nftIdentity';

const network = (name: string, chainId: string): NetworkJson =>
  ({ chainId, ecosystem: 'evm', icon: name.toLowerCase(), name }) as unknown as NetworkJson;

const collection = (
  address: string,
  networkName: string,
  tokenId: string,
  overrides: Partial<NftCollection> = {}
): NftCollection => ({
  address,
  name: `${networkName} collection`,
  network: networkName,
  ownedNfts: [
    {
      id: tokenId,
      isOwned: true,
      meta: {},
      network: networkName,
      ownedBy: '0xowner',
      type: 'ERC721',
    },
  ],
  ...overrides,
});

describe('NFT canonical network identity', () => {
  it('keeps the same contract address on different chains in separate sections', () => {
    const contract = '0xABCD';
    const nfts: ChainNftState = {
      '1': { [contract]: collection(contract, 'Ethereum', '1', { lastSyncedAt: 100 }) },
      '137': { [contract]: collection(contract, 'Polygon', '2', { lastSyncedAt: 200, syncStale: true }) },
    };

    const sections = buildNftNetworkSections({
      address: '0xowner',
      networks: [network('Ethereum', '1'), network('Polygon', '137')],
      nfts,
    });

    expect(sections).toHaveLength(2);
    expect(sections.map(({ chainId }) => chainId)).toEqual(['1', '137']);
    expect(sections[0].collections[0].key).not.toBe(sections[1].collections[0].key);
    expect(sections[1]).toMatchObject({ latestTimestamp: 200, stale: true });
  });

  it('normalizes EVM contract casing only within the same chain', () => {
    const nfts: ChainNftState = {
      '1': {
        first: collection('0xABCD', 'Ethereum', '1'),
        second: collection('0xabcd', 'Ethereum', '2'),
      },
    };

    const [section] = buildNftNetworkSections({
      address: '0xowner',
      networks: [network('Ethereum', '1')],
      nfts,
    });

    expect(section.collections).toHaveLength(1);
    expect(section.collections[0].ownedNfts.map(({ id }) => id)).toEqual(['1', '2']);
    expect(buildNftCollectionKey('evm', '1', '0xABCD')).toBe('evm:1:0xabcd');
    expect(buildAvailableNftKey('1', '0xABCD')).toBe('1:0xabcd');
    expect(findNftCollection(nfts, [network('Ethereum', '1')], '1', '0xabcd')?.address).toBe('0xABCD');
  });
});
