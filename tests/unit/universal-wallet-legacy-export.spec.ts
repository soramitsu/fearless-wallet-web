import { base58 } from '@scure/base';
import type { AccountJson } from '@extension-base/background/types/types';
import type { UniversalWalletLegacyVaultDescriptor } from '@/util/universalWalletMigrationContract';
import { WalletEcosystem } from '@/interfaces';
import { decodeBitcoinRecipient } from '@/util/bitcoin';
import {
  resolveLegacyExportNetwork,
  resolveUniversalWalletLegacyExportTarget,
} from '@/util/universalWalletLegacyExport';

const account = (overrides: Partial<AccountJson> = {}): AccountJson =>
  ({
    address: '5GrwvaEF5zXb26Fz9rcQpDWSjptH9q25Ve7kW9V4Fp3nFtN',
    ethereumAddress: '',
    name: 'Legacy',
    walletEcosystem: WalletEcosystem.Substrate,
    network: 'all',
    ...overrides,
  }) as AccountJson;

const vault = (
  overrides: Partial<UniversalWalletLegacyVaultDescriptor> = {}
): UniversalWalletLegacyVaultDescriptor => ({
  vaultId: 'legacy_5GrwvaEF5zXb26Fz9rcQpDWSjptH9q25Ve7kW9V4Fp3nFtN0',
  accountId: 'substrate-legacy-0',
  ecosystem: WalletEcosystem.Substrate,
  address: '5GrwvaEF5zXb26Fz9rcQpDWSjptH9q25Ve7kW9V4Fp3nFtN',
  mode: 'export-only',
  exportOnlyReason: 'pre-cutoff account export',
  canExportSecrets: true,
  canSignTransactions: false,
  discoveredAtMillis: 1_710_000_000_000,
  ...overrides,
});

describe('Universal Wallet legacy export target resolution', () => {
  it('resolves a concrete stored account and safe default network for a legacy substrate vault', () => {
    const target = resolveUniversalWalletLegacyExportTarget(vault(), [account()]);

    expect(target?.account.address).toBe('5GrwvaEF5zXb26Fz9rcQpDWSjptH9q25Ve7kW9V4Fp3nFtN');
    expect(target?.network).toBe('polkadot');
  });

  it('keeps a concrete account network instead of group filters', () => {
    const target = resolveUniversalWalletLegacyExportTarget(vault(), [account({ network: 'Westend' })]);

    expect(target?.network).toBe('Westend');
  });

  it('matches ecosystem-specific secondary addresses for legacy export recovery', () => {
    const target = resolveUniversalWalletLegacyExportTarget(
      vault({
        ecosystem: WalletEcosystem.Bitcoin,
        address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080',
      }),
      [
        account({
          address: '5BitcoinRoot',
          bitcoinAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080',
          walletEcosystem: WalletEcosystem.Bitcoin,
        }),
      ]
    );

    expect(target?.account.address).toBe('5BitcoinRoot');
    expect(target?.network).toBe('Bitcoin');
  });

  it('rejects unsafe or stale legacy export descriptors', () => {
    expect(resolveUniversalWalletLegacyExportTarget(vault({ canExportSecrets: false }), [account()])).toBeNull();
    expect(resolveUniversalWalletLegacyExportTarget(vault({ canSignTransactions: true }), [account()])).toBeNull();
    expect(resolveUniversalWalletLegacyExportTarget(vault({ address: 'missing' }), [account()])).toBeNull();
  });

  it('matches Iroha account literals case-sensitively', () => {
    const irohaAddress = 'testCaseSensitiveI105';
    const stored = account({ irohaAddress, walletEcosystem: WalletEcosystem.Iroha });

    expect(
      resolveUniversalWalletLegacyExportTarget(
        vault({ ecosystem: WalletEcosystem.Iroha, address: irohaAddress.toUpperCase() }),
        [stored]
      )
    ).toBeNull();
    expect(
      resolveUniversalWalletLegacyExportTarget(vault({ ecosystem: WalletEcosystem.Iroha, address: irohaAddress }), [
        stored,
      ])?.account
    ).toBe(stored);
  });

  it('maps non-substrate ecosystems to export route network names', () => {
    expect(resolveLegacyExportNetwork(vault({ ecosystem: WalletEcosystem.Ton }))).toBe('ton mainnet');
    expect(resolveLegacyExportNetwork(vault({ ecosystem: WalletEcosystem.Solana }))).toBe('Solana');
    expect(resolveLegacyExportNetwork(vault({ ecosystem: WalletEcosystem.Iroha }))).toBe('Taira Testnet');
    expect(resolveLegacyExportNetwork(vault({ ecosystem: WalletEcosystem.Evm }))).toBe('Ethereum');
  });

  it('does not select another valid Solana public key that differs only by letter case', () => {
    const address = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const collision = 'TokenkegqfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    expect(base58.decode(address)).toHaveLength(32);
    expect(base58.decode(collision)).toHaveLength(32);
    expect(base58.decode(address)).not.toEqual(base58.decode(collision));
    const wrong = account({ address: collision, walletEcosystem: WalletEcosystem.Solana });
    const correct = account({ address, walletEcosystem: WalletEcosystem.Solana });
    const descriptor = vault({ ecosystem: WalletEcosystem.Solana, address });

    expect(resolveUniversalWalletLegacyExportTarget(descriptor, [wrong])).toBeNull();
    expect(resolveUniversalWalletLegacyExportTarget(descriptor, [wrong, correct])?.account).toBe(correct);
    expect(resolveUniversalWalletLegacyExportTarget(descriptor, [account({ solanaAddress: collision })])).toBeNull();
    expect(
      resolveUniversalWalletLegacyExportTarget(descriptor, [account({ solanaAddress: address })])?.account.solanaAddress
    ).toBe(address);
  });

  it.each([WalletEcosystem.Substrate, WalletEcosystem.Ton, WalletEcosystem.Iroha])(
    'preserves exact address text for %s vaults',
    (ecosystem) => {
      const stored = account({ walletEcosystem: ecosystem });
      expect(resolveUniversalWalletLegacyExportTarget(vault({ ecosystem }), [stored])?.account).toBe(stored);
      expect(
        resolveUniversalWalletLegacyExportTarget(vault({ ecosystem, address: stored.address.toUpperCase() }), [stored])
      ).toBeNull();
    }
  );

  it('accepts case variants only for complete hexadecimal EVM addresses', () => {
    const address = '0x52908400098527886E0F7030069857D2E4169EE7';
    const stored = account({ ethereumAddress: address });
    expect(
      resolveUniversalWalletLegacyExportTarget(
        vault({ ecosystem: WalletEcosystem.Evm, address: address.toLowerCase() }),
        [stored]
      )?.account
    ).toBe(stored);
    expect(
      resolveUniversalWalletLegacyExportTarget(vault({ ecosystem: WalletEcosystem.Evm, address: '0xNotAnAddress' }), [
        account({ ethereumAddress: '0xnotanaddress' }),
      ])
    ).toBeNull();
  });

  it('accepts valid all-uppercase Bitcoin SegWit but rejects mixed case and Base58 case folding', () => {
    const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    expect(decodeBitcoinRecipient(address)?.type).toBe('p2wpkh');
    const stored = account({ bitcoinAddress: address });
    expect(
      resolveUniversalWalletLegacyExportTarget(
        vault({ ecosystem: WalletEcosystem.Bitcoin, address: address.toUpperCase() }),
        [stored]
      )?.account
    ).toBe(stored);
    expect(
      resolveUniversalWalletLegacyExportTarget(
        vault({ ecosystem: WalletEcosystem.Bitcoin, address: `BC${address.slice(2)}` }),
        [stored]
      )
    ).toBeNull();
    const base58Address = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
    expect(decodeBitcoinRecipient(base58Address)?.type).toBe('p2pkh');
    expect(
      resolveUniversalWalletLegacyExportTarget(
        vault({ ecosystem: WalletEcosystem.Bitcoin, address: base58Address.toLowerCase() }),
        [account({ bitcoinAddress: base58Address })]
      )
    ).toBeNull();
    const invalidSegwit = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';
    expect(
      resolveUniversalWalletLegacyExportTarget(
        vault({ ecosystem: WalletEcosystem.Bitcoin, address: invalidSegwit.toUpperCase() }),
        [account({ bitcoinAddress: invalidSegwit })]
      )
    ).toBeNull();
  });

  it.each([
    'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
    'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
  ])('preserves valid Bitcoin case equivalence for %s', (address) => {
    const stored = account({ bitcoinAddress: address });
    expect(
      resolveUniversalWalletLegacyExportTarget(
        vault({ ecosystem: WalletEcosystem.Bitcoin, address: address.toUpperCase() }),
        [stored]
      )?.account
    ).toBe(stored);
  });
});
