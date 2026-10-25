import { getMockAssets } from '@extension-base/background/helpers/assets';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

const nativePrecision = (symbol: string): number => {
  if (symbol === 'BTC') return 8;
  if (symbol === 'XOR') return 9;

  return 10;
};

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
        precision: nativePrecision(symbol),
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
      Taira: network('Taira', 'iroha', '6TEAJqbb8oEPmLncoNiMRbLEK6tw', 'XOR'),
      Polkadot: network('Polkadot', 'substrate', 'DOT', 'DOT'),
      Solana: network('Solana', 'solana', 'SOL', 'SOL'),
    };

    expect(getMockAssets(networkMap, WalletEcosystem.Substrate).map(({ groupId }) => groupId)).toEqual(['DOT']);
    expect(getMockAssets(networkMap, WalletEcosystem.Bitcoin).map(({ groupId }) => groupId)).toEqual(['BTC']);
    expect(getMockAssets(networkMap, WalletEcosystem.Solana).map(({ groupId }) => groupId)).toEqual(['SOL']);
    expect(getMockAssets(networkMap, WalletEcosystem.Iroha).map(({ groupId }) => groupId)).toEqual([
      '6TEAJqbb8oEPmLncoNiMRbLEK6tw',
    ]);
  });

  it('does not merge same-symbol assets or invent symbol-bound price ids', () => {
    const first = network('First EVM', 'ethereum', '0xAa', 'USD');
    const second = network('Second EVM', 'ethereum', '0xBb', 'USD');

    delete first.assets[0].priceId;
    second.assets[0].priceId = 'verified-second-price';

    const groups = getMockAssets({ first, second }, WalletEcosystem.Evm);

    expect(groups).toHaveLength(2);
    expect(groups.map(({ balances }) => balances[0].id)).toEqual(['0xAa', '0xBb']);
    expect(groups.map(({ priceId }) => priceId)).toEqual([undefined, 'verified-second-price']);
    expect(groups.map(({ balances }) => balances[0].assetMetadataTrust)).toEqual(['verified', 'verified']);
  });
});
