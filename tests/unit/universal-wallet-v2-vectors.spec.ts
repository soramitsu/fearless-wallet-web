import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  UNIVERSAL_WALLET_BITCOIN_NETWORKS,
  UNIVERSAL_WALLET_DEFAULT_WORD_COUNT,
  UNIVERSAL_WALLET_DERIVATION_PATHS,
  UNIVERSAL_WALLET_INDEXERS,
  UNIVERSAL_WALLET_IROHA_NETWORKS,
  UNIVERSAL_WALLET_SOLANA_NETWORKS,
} from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';

type BitcoinNetworkVector = {
  accountPath: string;
  firstReceivePath: string;
  firstReceiveAddress: string;
};

type IrohaNetworkVector = {
  canonicalHex: string;
  chainDiscriminant: number;
  i105: string;
};

type VectorExpected = {
  bitcoin: {
    mainnet: BitcoinNetworkVector;
    testnet: BitcoinNetworkVector;
  };
  evm: {
    address: string;
    derivationPath: string;
  };
  iroha: {
    derivationPath: string;
    nexus: IrohaNetworkVector;
    taira: IrohaNetworkVector;
  };
  solana: {
    address: string;
    derivationPath: string;
    publicKeyHex: string;
  };
  substrate: {
    cryptoType: string;
    derivationPath: string;
    polkadotAddress: string;
    publicKeyHex: string;
    ss58Prefix: number;
  };
  ton: {
    addressNonBounceable: string;
    derivationPath: string;
    publicKeyHex: string;
    testnetNonBounceable: string;
    walletVersion: string;
    workchain: number;
  };
};

type Vector = {
  id: string;
  mnemonic: string;
  wordCount: number;
  expected: VectorExpected;
};

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')
) as {
  version: number;
  vectors: Vector[];
  negativeCases: Array<{ id: string; reason: string }>;
};

describe('Universal Wallet V2 vectors', () => {
  it('defines the canonical ecosystem, derivation, and address fixture shape', () => {
    expect(fixture.version).toBe(1);
    expect(fixture.vectors.map(({ id }) => id)).toEqual(['import12', 'default24']);
    expect(UNIVERSAL_WALLET_DEFAULT_WORD_COUNT).toBe(24);
    expect(fixture.negativeCases.map(({ id }) => id).sort()).toEqual([
      'bitcoin-wrong-purpose',
      'iroha-wrong-discriminant',
      'solana-wrong-path',
      'ton-testnet-flag',
    ]);
    expect(new Set(Object.values(WalletEcosystem))).toEqual(new Set(['substrate', 'evm', 'ton', 'bitcoin', 'solana', 'iroha']));

    for (const vector of fixture.vectors) {
      expect(vector.mnemonic.split(' ')).toHaveLength(vector.wordCount);
      expect([12, 24]).toContain(vector.wordCount);
      expect(Object.keys(vector.expected).sort()).toEqual([
        'bitcoin',
        'evm',
        'iroha',
        'solana',
        'substrate',
        'ton',
      ]);

      expect(vector.expected.substrate.cryptoType).toBe('sr25519');
      expect(vector.expected.substrate.ss58Prefix).toBe(0);
      expect(vector.expected.substrate.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
      expect(vector.expected.substrate.polkadotAddress).toMatch(/^1/);

      expect(vector.expected.evm.derivationPath).toBe("m/44'/60'/0'/0/0");
      expect(vector.expected.evm.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

      expect(vector.expected.solana.derivationPath).toBe("m/44'/501'/0'/0'");
      expect(vector.expected.solana.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
      expect(vector.expected.solana.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

      expect(vector.expected.ton.derivationPath).toBe("m/44'/607'/0'/0'/0'");
      expect(vector.expected.ton.walletVersion).toBe('v4r2');
      expect(vector.expected.ton.workchain).toBe(0);
      expect(vector.expected.ton.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);

      expect(vector.expected.iroha.derivationPath).toBe("m/44'/617'/0'/0'");
      expect(vector.expected.iroha.taira.chainDiscriminant).toBe(369);
      expect(vector.expected.iroha.nexus.chainDiscriminant).toBe(753);
    }
  });

  it('keeps network-specific addresses distinct', () => {
    for (const vector of fixture.vectors) {
      const { bitcoin, ton, iroha } = vector.expected;

      expect(bitcoin.mainnet.accountPath).toBe("m/84'/0'/0'");
      expect(bitcoin.mainnet.firstReceiveAddress).toMatch(/^bc1q/);
      expect(bitcoin.testnet.accountPath).toBe("m/84'/1'/0'");
      expect(bitcoin.testnet.firstReceiveAddress).toMatch(/^tb1q/);
      expect(bitcoin.mainnet.firstReceiveAddress).not.toBe(bitcoin.testnet.firstReceiveAddress);

      expect(ton.addressNonBounceable).toMatch(/^UQ/);
      expect(ton.testnetNonBounceable).toMatch(/^0Q/);
      expect(ton.addressNonBounceable).not.toBe(ton.testnetNonBounceable);

      expect(iroha.taira.canonicalHex).toBe(iroha.nexus.canonicalHex);
      expect(iroha.taira.i105).toMatch(/^test/);
      expect(iroha.nexus.i105).toMatch(/^sora/);
      expect(iroha.taira.i105).not.toBe(iroha.nexus.i105);
    }
  });

  it('defines public indexers and gated Iroha registry metadata', () => {
    expect(UNIVERSAL_WALLET_INDEXERS).toEqual({
      bitcoin: {
        mainnet: 'https://blockstream.info/api',
        testnet: 'https://blockstream.info/testnet/api',
      },
      ton: 'https://ti.soramitsu.io',
      solana: 'https://si.soramitsu.io',
    });
    expect(UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet).toEqual({
      id: 'bitcoin-mainnet',
      chainId: 'bitcoin:mainnet',
      name: 'Bitcoin',
      slip44CoinType: 0,
      addressHrp: 'bc',
      accountPath: "m/84'/0'/0'",
      firstReceivePath: "m/84'/0'/0'/0/0",
      defaultGapLimit: 20,
      enabledByDefault: true,
      nativeAsset: {
        id: 'BTC',
        symbol: 'BTC',
        decimals: 8,
      },
    });
    expect(UNIVERSAL_WALLET_BITCOIN_NETWORKS.testnet).toEqual({
      id: 'bitcoin-testnet',
      chainId: 'bitcoin:testnet',
      name: 'Bitcoin Testnet',
      slip44CoinType: 1,
      addressHrp: 'tb',
      accountPath: "m/84'/1'/0'",
      firstReceivePath: "m/84'/1'/0'/0/0",
      defaultGapLimit: 20,
      enabledByDefault: false,
      nativeAsset: {
        id: 'BTC',
        symbol: 'BTC',
        decimals: 8,
      },
    });
    expect(UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet).toEqual({
      id: 'solana-mainnet',
      chainId: 'solana:mainnet',
      name: 'Solana',
      indexerUrl: 'https://si.soramitsu.io',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      historyApi: {
        type: 'solana',
        url: 'https://si.soramitsu.io',
      },
      enabledByDefault: true,
      nativeAsset: {
        id: 'SOL',
        symbol: 'SOL',
        decimals: 9,
      },
    });
    expect(UNIVERSAL_WALLET_SOLANA_NETWORKS.devnet).toEqual({
      id: 'solana-devnet',
      chainId: 'solana:devnet',
      name: 'Solana Devnet',
      indexerUrl: 'https://si.soramitsu.io',
      rpcUrl: 'https://api.devnet.solana.com',
      historyApi: {
        type: 'solana',
        url: 'https://si.soramitsu.io',
      },
      enabledByDefault: false,
      nativeAsset: {
        id: 'SOL',
        symbol: 'SOL',
        decimals: 9,
      },
    });

    expect(UNIVERSAL_WALLET_IROHA_NETWORKS.taira).toEqual({
      id: 'taira-testnet',
      chainId: 'iroha3-taira',
      chainDiscriminant: 369,
      toriiBaseUrl: 'https://taira.sora.org',
      mcpPath: '/v1/mcp',
      enabledByDefault: true,
    });
    expect(UNIVERSAL_WALLET_IROHA_NETWORKS.nexus).toEqual({
      id: 'sora-nexus-mainnet',
      chainId: 'sora:nexus:global',
      chainDiscriminant: 753,
      toriiBaseUrl: 'https://minamoto.sora.org',
      mcpPath: '/v1/mcp',
      enabledByDefault: false,
    });
  });

  it('keeps derivation constants aligned with the fixture defaults', () => {
    const expected = fixture.vectors[0].expected;

    expect(expected.substrate.derivationPath).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.substrateRoot);
    expect(expected.evm.derivationPath).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.evmDefault);
    expect(expected.bitcoin.mainnet.accountPath).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinMainnetAccount);
    expect(expected.bitcoin.mainnet.firstReceivePath).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinMainnetFirstReceive);
    expect(expected.bitcoin.testnet.accountPath).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinTestnetAccount);
    expect(expected.bitcoin.testnet.firstReceivePath).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinTestnetFirstReceive);
    expect(expected.solana.derivationPath).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.solanaDefault);
    expect(expected.ton.derivationPath).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.tonDefault);
    expect(expected.iroha.derivationPath).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.irohaDefault);
  });
});
