import { SubBridgeApi } from '../../src/sora/bridgeProxy/sub';
import { SubNetworkId, SubAssetKind } from '../../src/sora/bridgeProxy/sub/consts';

jest.mock('../../src/sora/assets', () => ({
  toAssetId: jest.fn((payload: any) => {
    if (payload && typeof payload === 'object' && 'mockId' in payload) {
      return payload.mockId;
    }

    return 'mock-asset';
  }),
}));

const createOption = <T>(value: T, isEmpty = false) => ({
  isEmpty,
  isSome: !isEmpty,
  unwrap: () => value,
});

describe('SubBridgeApi asset helpers', () => {
  let apiMock: any;
  let bridge: SubBridgeApi<unknown>;

  beforeEach(() => {
    apiMock = {
      query: {
        substrateBridgeApp: {
          sidechainPrecision: jest.fn(),
          sidechainAssetId: jest.fn(),
          assetKinds: jest.fn(),
        },
        parachainBridgeApp: {
          sidechainPrecision: jest.fn(),
          assetKinds: jest.fn(),
          relaychainAsset: jest.fn(),
          allowedParachainAssets: jest.fn(),
        },
      },
    };

    bridge = new SubBridgeApi();
    (bridge as any).connection = { api: apiMock };
  });

  it('hydrates Liberland asset metadata', async () => {
    apiMock.query.substrateBridgeApp.sidechainPrecision.mockResolvedValue(createOption({ toNumber: () => 12 }));
    apiMock.query.substrateBridgeApp.sidechainAssetId.mockResolvedValue({
      isEmpty: false,
      unwrap: () => ({
        asLiberland: {
          isLld: false,
          asAsset: { toNumber: () => 42 },
        },
      }),
    });
    apiMock.query.substrateBridgeApp.assetKinds.mockResolvedValue(createOption({ isSidechain: true }));

    const result = await (bridge as any).getSubAssetData(SubNetworkId.Liberland, 'xor-asset');

    expect(result).toEqual({
      address: { Asset: 42 },
      decimals: 12,
      assetKind: SubAssetKind.Sidechain,
    });
  });

  it('hydrates relaychain whitelisted asset', async () => {
    apiMock.query.parachainBridgeApp.relaychainAsset.mockResolvedValue(createOption({ mockId: 'relay-token' }));
    apiMock.query.parachainBridgeApp.sidechainPrecision.mockResolvedValue(createOption({ toNumber: () => 10 }));
    apiMock.query.parachainBridgeApp.assetKinds.mockResolvedValue(createOption({ isSidechain: false }));

    const map = await (bridge as any).getRelayChainAssets(SubNetworkId.Polkadot);

    expect(map).toEqual({
      'relay-token': {
        address: undefined,
        decimals: 10,
        assetKind: SubAssetKind.Thischain,
      },
    });
  });

  it('hydrates parachain allowed assets', async () => {
    apiMock.query.parachainBridgeApp.allowedParachainAssets.mockResolvedValue([
      { mockId: 'para-asset-1' },
      { mockId: 'para-asset-2' },
    ]);
    apiMock.query.parachainBridgeApp.sidechainPrecision.mockResolvedValue(createOption({ toNumber: () => 8 }));
    apiMock.query.parachainBridgeApp.assetKinds.mockResolvedValue(createOption({ isSidechain: true }));

    const assets = await (bridge as any).getParaChainAssets(SubNetworkId.PolkadotMoonbeam);

    expect(Object.keys(assets)).toEqual(['para-asset-1', 'para-asset-2']);
    expect(assets['para-asset-1']).toEqual({
      address: undefined,
      decimals: 8,
      assetKind: SubAssetKind.Sidechain,
    });
  });
});
