import AlchemyNftController from '@extension-base/services/nft-service/handlers/AlchemyNftSdk';
import { NFT_FILTERS } from '@extension-base/services/nft-service/consts';
import type { NftService } from '@extension-base/services/nft-service';
import type State from '@extension-base/background/handlers/State';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function createState(): State {
  return {
    networkService: {
      networkMap: {
        ethereum: {
          chainId: '1',
          name: 'Ethereum',
        },
      },
    },
  } as unknown as State;
}

function createNftService(filters = [NFT_FILTERS.AIRDROPS]): NftService {
  return {
    excludeFilters: vi.fn(() => filters),
    nftMap: {},
  } as unknown as NftService;
}

describe('Alchemy NFT REST client', () => {
  const originalAlchemyKey = process.env.FL_WEB_ALCHEMY_API_ETHEREUM_KEY;

  afterEach(() => {
    process.env.FL_WEB_ALCHEMY_API_ETHEREUM_KEY = originalAlchemyKey;
    vi.restoreAllMocks();
  });

  it('serializes owner requests with the same network, demo key fallback, and filter shape as the SDK', async () => {
    process.env.FL_WEB_ALCHEMY_API_ETHEREUM_KEY = '';
    const fetchCalls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL) => {
      fetchCalls.push(input.toString());

      return jsonResponse({ ownedNfts: [], totalCount: 0 });
    });
    const controller = new AlchemyNftController(
      'eth-mainnet',
      '1',
      createNftService(),
      createState(),
      fetchFn
    );

    await controller.getNfts('0xowner');

    const url = new URL(fetchCalls[0]!);

    expect(url.origin).toBe('https://eth-mainnet.g.alchemy.com');
    expect(url.pathname).toBe('/nft/v3/demo/getNFTsForOwner');
    expect(url.searchParams.get('owner')).toBe('0xowner');
    expect(url.searchParams.get('withMetadata')).toBe('true');
    expect(url.searchParams.getAll('excludeFilters[]')).toEqual([NFT_FILTERS.AIRDROPS]);
  });

  it('groups NFTs by contract, keeps text metadata, and sanitizes media URLs when collection records are missing', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ownedNfts: [
            {
              contract: {
                address: '0xcontract',
                name: 'Fallback Collection',
                totalSupply: '1',
                openSeaMetadata: {
                  imageUrl: 'javascript:alert(1)',
                },
                isSpam: true,
              },
              tokenId: '7',
              tokenType: 'ERC721',
              name: '<img src=x onerror=alert(1)>',
              description: '<script>alert(1)</script>',
              image: {
                originalUrl: 'ipfs://ipfs/token',
                contentType: 'image/png',
              },
              mint: {
                mintAddress: '0xmint',
              },
            },
          ],
          totalCount: 1,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ contracts: [], totalCount: 0 }));
    const controller = new AlchemyNftController(
      'eth-mainnet',
      '1',
      createNftService([]),
      createState(),
      fetchFn
    );

    const nfts = await controller.fetchNftsForWallet('0xowner');

    expect(nfts['0xcontract']).toMatchObject({
      address: '0xcontract',
      image: undefined,
      isSpam: true,
      name: 'Fallback Collection',
      network: 'Ethereum',
      total: '1',
    });
    expect(nfts['0xcontract'].ownedNfts).toEqual([
      {
        id: '7',
        isOwned: true,
        meta: {
          description: '<script>alert(1)</script>',
          name: '<img src=x onerror=alert(1)>',
        },
        type: 'ERC721',
        image: 'https://ipfs.io/ipfs/token',
        creator: '0xmint',
        network: 'Ethereum',
        ownedBy: '0xowner',
        contentType: 'image/png',
      },
    ]);
  });

  it('drops unsafe NFT media schemes and prefers cached HTTPS media over raw originals', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ownedNfts: [
            {
              contract: {
                address: '0xcontract',
                name: 'Unsafe Media Collection',
                openSeaMetadata: {
                  imageUrl: 'data:image/svg+xml,<svg onload=alert(1)>',
                },
              },
              tokenId: '8',
              tokenType: 'ERC721',
              image: {
                cachedUrl: 'https://safe.example/token.png',
                originalUrl: 'javascript:alert(1)',
                pngUrl: 'ipns://collection/token.png',
              },
            },
          ],
          totalCount: 1,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ contracts: [], totalCount: 0 }));
    const controller = new AlchemyNftController(
      'eth-mainnet',
      '1',
      createNftService([]),
      createState(),
      fetchFn
    );

    const nfts = await controller.fetchNftsForWallet('0xowner');

    expect(nfts['0xcontract'].image).toBe('https://safe.example/token.png');
    expect(nfts['0xcontract'].ownedNfts[0]?.image).toBe('https://safe.example/token.png');
  });

  it('filters already-owned token ids from contract pages and tolerates missing local ownership cache', async () => {
    const nftService = createNftService([]);
    nftService.nftMap = {
      '0xowner': {
        '1': {
          '0xcontract': {
            address: '0xcontract',
            network: 'Ethereum',
            ownedNfts: [{ id: '1', isOwned: true, meta: {}, type: 'ERC721', ownedBy: '0xowner', network: 'Ethereum' }],
          },
        },
      },
    };
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        nfts: [
          {
            contract: { address: '0xcontract', openSeaMetadata: {} },
            tokenId: '1',
            tokenType: 'ERC721',
            image: {},
          },
          {
            contract: { address: '0xcontract', openSeaMetadata: {} },
            tokenId: '2',
            tokenType: 'ERC721',
            image: { cachedUrl: 'https://safe.example/nft.png' },
          },
        ],
        pageKey: 'next-page',
      })
    );
    const controller = new AlchemyNftController('eth-mainnet', '1', nftService, createState(), fetchFn);

    await expect(controller.getCollectionPage('0xmissing-cache', '0xunknown')).resolves.toEqual({
      nfts: expect.any(Array),
      pageKey: 'next-page',
    });

    const result = await controller.getCollectionPage('0xcontract', '0xowner');

    expect(result).toEqual({
      nfts: [
        {
          id: '2',
          isOwned: false,
          meta: {
            description: undefined,
            name: undefined,
          },
          type: 'ERC721',
          image: 'https://safe.example/nft.png',
          creator: undefined,
          network: 'Ethereum',
          ownedBy: '',
          contentType: undefined,
        },
      ],
      pageKey: 'next-page',
    });
  });

  it('rejects non-OK Alchemy responses with bounded error text', async () => {
    const fetchFn = vi.fn(async () => new Response('upstream failure'.repeat(50), { status: 503 }));
    const controller = new AlchemyNftController(
      'eth-mainnet',
      '1',
      createNftService(),
      createState(),
      fetchFn
    );

    await expect(controller.getNfts('0xowner')).rejects.toThrow(/^Alchemy NFT getNFTsForOwner failed with 503:/);
  });
});
