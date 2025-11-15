import {
  assertValidRecipient,
  getNetworkId,
} from '@/extension/background/extension-base/src/api/substrate/sora/bridge';
import { SubNetworkId } from '@sora/bridgeProxy/sub/consts';
import { VALID_ETHEREUM_ADDRESS, VALID_SUBSTRATE_ADDRESS } from '@/consts/networks';

describe('assertValidRecipient', () => {
  it('accepts valid Substrate recipients for relaychains and parachains', () => {
    expect(() => assertValidRecipient('Polkadot', SubNetworkId.Polkadot, VALID_SUBSTRATE_ADDRESS)).not.toThrow();
  });

  it('rejects missing recipients', () => {
    expect(() => assertValidRecipient('Kusama', SubNetworkId.Kusama, '')).toThrow(
      'Bridge recipient address is required'
    );
  });

  it('enforces EVM formatting for networks that expect 0x accounts', () => {
    expect(() =>
      assertValidRecipient('Moonbase Alpha', SubNetworkId.AlphanetMoonbase, VALID_ETHEREUM_ADDRESS)
    ).not.toThrow();

    expect(() =>
      assertValidRecipient('Moonbase Alpha', SubNetworkId.AlphanetMoonbase, VALID_SUBSTRATE_ADDRESS)
    ).toThrow('Destination network "Moonbase Alpha" expects an EVM address (0x...)');
  });

  it('enforces Substrate formatting for non-EVM destinations', () => {
    expect(() => assertValidRecipient('Polkadot', SubNetworkId.Polkadot, 'invalid-address')).toThrow(
      'Destination network "Polkadot" expects a valid Substrate public key'
    );
  });
});

describe('getNetworkId', () => {
  it.each([
    ['assethub (polkadot)', SubNetworkId.PolkadotAssetHub],
    ['AssetHub Kusama', SubNetworkId.KusamaAssetHub],
    ['SORA (Polkadot Parachain)', SubNetworkId.PolkadotSora],
    ['Sora testnet', SubNetworkId.AlphanetSora],
    ['Moonbeam (EVM)', SubNetworkId.PolkadotMoonbeam],
    ['Moonriver', SubNetworkId.KusamaMoonriver],
    ['Moonbase Alpha Testnet', SubNetworkId.AlphanetMoonbase],
    ['Shiden Network', SubNetworkId.KusamaShiden],
    ['Curio Parachain', SubNetworkId.KusamaCurio],
    ['Acala Network', SubNetworkId.PolkadotAcala],
    ['Astar', SubNetworkId.PolkadotAstar],
    ['Liberland Network', SubNetworkId.Liberland],
  ])('maps %s to %s', (label, expectedId) => {
    expect(getNetworkId(label)).toBe(expectedId);
  });

  it('throws when the destination is not supported', () => {
    expect(() => getNetworkId('Atlantis')).toThrow('Unsupported SORA bridge destination "Atlantis"');
  });
});
