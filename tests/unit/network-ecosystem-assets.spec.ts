import { getMockAssets } from '@extension-base/background/helpers/assets';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

const network = (name: string, ecosystem: NetworkJson['ecosystem'], assetId: string, symbol: string): NetworkJson =>
  ({
    active: true,
    addressPrefix: 0,
    assets: [
      {
        color: '#ffffff',
        icon: symbol.toLowerCase(),
        id: assetId,
        isNative: true,
        isUtility: true,
        name,
        precision: symbol === 'BTC' ? 8 : 10,
        priceId: symbol,
        providers: [],
        staking: '',
        symbol,
        tonType: 'normal',
        type: ecosystem === 'bitcoin' ? 'bitcoin' : 'normal',
      },
    ],
    chain: name,
    chainId: `${ecosystem}:${name.toLowerCase()}`,
    currentProvider: 'default',
    customNodes: [],
    disabled: false,
    ecosystem,
    favorite: [],
    genesisHash: `0x${name.toLowerCase()}`,
    icon: symbol.toLowerCase(),
    key: name,
    name,
    nodes: [],
    providers: {},
    ss58Format: 0,
    types: { name, url: '' },
  }) as unknown as NetworkJson;

describe('network ecosystem mock assets', () => {
  it('keeps Bitcoin assets out of Substrate wallets and exposes them for Bitcoin wallets', () => {
    const networkMap = {
      Bitcoin: network('Bitcoin', 'bitcoin', 'BTC', 'BTC'),
      Taira: network('Taira', 'iroha', 'xor#sora', 'XOR'),
      Polkadot: network('Polkadot', 'substrate', 'DOT', 'DOT'),
      Solana: network('Solana', 'solana', 'SOL', 'SOL'),
    };

    expect(getMockAssets(networkMap, WalletEcosystem.Substrate).map(({ groupId }) => groupId)).toEqual(['DOT']);
    expect(getMockAssets(networkMap, WalletEcosystem.Bitcoin).map(({ groupId }) => groupId)).toEqual(['BTC']);
    expect(getMockAssets(networkMap, WalletEcosystem.Solana).map(({ groupId }) => groupId)).toEqual(['SOL']);
    expect(getMockAssets(networkMap, WalletEcosystem.Iroha).map(({ groupId }) => groupId)).toEqual(['xor#sora']);
  });
});
