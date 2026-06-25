import type { AccountJson } from '@extension-base/background/types/types';
import type { UniversalWalletLegacyVaultDescriptor } from '@/util/universalWalletMigrationContract';
import { WalletEcosystem } from '@/interfaces';
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

const vault = (overrides: Partial<UniversalWalletLegacyVaultDescriptor> = {}): UniversalWalletLegacyVaultDescriptor => ({
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
    expect(
      resolveUniversalWalletLegacyExportTarget(vault({ canExportSecrets: false }), [account()])
    ).toBeNull();
    expect(resolveUniversalWalletLegacyExportTarget(vault({ canSignTransactions: true }), [account()])).toBeNull();
    expect(resolveUniversalWalletLegacyExportTarget(vault({ address: 'missing' }), [account()])).toBeNull();
  });

  it('maps non-substrate ecosystems to export route network names', () => {
    expect(resolveLegacyExportNetwork(vault({ ecosystem: WalletEcosystem.Ton }))).toBe('ton mainnet');
    expect(resolveLegacyExportNetwork(vault({ ecosystem: WalletEcosystem.Solana }))).toBe('Solana');
    expect(resolveLegacyExportNetwork(vault({ ecosystem: WalletEcosystem.Iroha }))).toBe('Taira Testnet');
    expect(resolveLegacyExportNetwork(vault({ ecosystem: WalletEcosystem.Evm }))).toBe('Ethereum');
  });
});
