import bridgeProxy from '@/sora/typeDefinitions/raw/bridgeProxy';
import { SubNetworkId } from '@sora-substrate/util/src/bridgeProxy/sub/consts';

describe('bridgeProxy type definitions', () => {
  it('map every SubNetworkId variant exposed by the util package', () => {
    const definedSubNetworks = Object.keys(bridgeProxy.types.SubNetworkId._enum);
    const expectedNetworks = Object.values(SubNetworkId);

    expectedNetworks.forEach((network) => {
      expect(definedSubNetworks).toContain(network);
    });
  });

  it('keeps Custom SubNetworkId fallback for forward compatibility', () => {
    expect(bridgeProxy.types.SubNetworkId._enum.Custom).toBe('u32');
  });
});
