import { WalletEcosystem } from '@/interfaces';
import { buildUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import {
  buildWebUniversalWalletMigrationSnapshot,
  getWebUniversalWalletMigrationRequiredAction,
  hasActiveUniversalWallet,
  type WebUniversalWalletMigrationAccount,
} from '@/util/universalWalletKeyringMigration';

const NOW = 1_710_000_000_100;
const SUBSTRATE_ADDRESS = '15FKRtF6nX3SE4PaW4LX69XqYHq2oSep9JX5KF4cgN1XkZ4q';
const EVM_ADDRESS = '0x1111111111111111111111111111111111111111';
const BITCOIN_MAINNET_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const BITCOIN_TESTNET_ADDRESS = 'tb1qfmxy27sn8v4d8jwm23qv0a6tq7cyrtn4gk0q88';
const SOLANA_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const TON_ADDRESS = 'UQDxAUFadQXDd3EXGa3TLF_EF66gMc9h3_aZ0j0zXNoIYUCc';
const IROHA_ADDRESS = 'testuAddressForMigration';

describe('web Universal Wallet keyring migration snapshot', () => {
  it('requires migration when legacy accounts exist without an active universal wallet', () => {
    const snapshot = buildWebUniversalWalletMigrationSnapshot({
      accounts: [legacyAccount()],
      nowMillis: NOW,
    });

    expect(snapshot.hasUniversalWallet).toBe(false);
    expect(snapshot.legacyVaults).toEqual([
      expect.objectContaining({
        address: SUBSTRATE_ADDRESS,
        canExportSecrets: true,
        canSignTransactions: false,
        ecosystem: WalletEcosystem.Substrate,
        mode: 'export-only',
      }),
    ]);
    expect(getWebUniversalWalletMigrationRequiredAction({ accounts: [legacyAccount()], nowMillis: NOW })).toBe(
      'migrate-before-access'
    );
  });

  it('allows normal access when an active universal wallet exists while preserving legacy export descriptors', () => {
    const accounts = [universalAccount(), legacyAccount({ address: 'legacy-secondary', name: 'Old account' })];
    const snapshot = buildWebUniversalWalletMigrationSnapshot({ accounts, nowMillis: NOW });

    expect(hasActiveUniversalWallet(accounts)).toBe(true);
    expect(snapshot.hasUniversalWallet).toBe(true);
    expect(snapshot.legacyVaults).toEqual([
      expect.objectContaining({
        address: 'legacy-secondary',
        displayName: 'Old account',
      }),
    ]);
    expect(getWebUniversalWalletMigrationRequiredAction({ accounts, nowMillis: NOW })).toBe('normal-access');
  });

  it('does not treat malformed or partial universal metadata as normal-access capable', () => {
    const invalidUniversal = universalAccount();

    invalidUniversal.meta!.universalWallet = {
      ...invalidUniversal.meta!.universalWallet!,
      status: 'active',
      walletId: '../bad',
    };

    const snapshot = buildWebUniversalWalletMigrationSnapshot({
      accounts: [invalidUniversal],
      nowMillis: NOW,
    });

    expect(snapshot.hasUniversalWallet).toBe(false);
    expect(snapshot.legacyVaults).toHaveLength(1);
    expect(getWebUniversalWalletMigrationRequiredAction({ accounts: [invalidUniversal], nowMillis: NOW })).toBe(
      'migrate-before-access'
    );
  });

  it('excludes linked EVM child accounts from legacy vault descriptors', () => {
    const snapshot = buildWebUniversalWalletMigrationSnapshot({
      accounts: [
        legacyAccount(),
        {
          address: EVM_ADDRESS,
          meta: { name: 'EVM child', walletEcosystem: WalletEcosystem.Evm },
          type: 'ethereum',
        },
      ],
      nowMillis: NOW,
    });

    expect(snapshot.legacyVaults.map(({ address }) => address)).toEqual([SUBSTRATE_ADDRESS]);
  });

  it('requires a create-universal-wallet action when no wallet material exists', () => {
    expect(getWebUniversalWalletMigrationRequiredAction({ accounts: [], nowMillis: NOW })).toBe(
      'create-universal-wallet'
    );
  });
});

function universalAccount(): WebUniversalWalletMigrationAccount {
  const meta = fullMeta();

  return {
    address: SUBSTRATE_ADDRESS,
    meta: {
      ...meta,
      universalWallet: buildUniversalWalletKeyringMeta({
        address: SUBSTRATE_ADDRESS,
        meta,
        walletEcosystem: WalletEcosystem.Substrate,
        nowMillis: NOW,
      }),
    },
  };
}

function legacyAccount(overrides: Partial<WebUniversalWalletMigrationAccount & { name: string }> = {}) {
  return {
    address: SUBSTRATE_ADDRESS,
    meta: {
      name: overrides.name ?? 'Legacy DOT',
      walletEcosystem: WalletEcosystem.Substrate,
    },
    ...overrides,
  } satisfies WebUniversalWalletMigrationAccount;
}

function fullMeta() {
  return {
    name: 'Fearless Universal',
    walletEcosystem: WalletEcosystem.Substrate,
    ethereumAddress: EVM_ADDRESS,
    bitcoinAddress: BITCOIN_MAINNET_ADDRESS,
    bitcoinTestnetAddress: BITCOIN_TESTNET_ADDRESS,
    solanaAddress: SOLANA_ADDRESS,
    tonAddress: TON_ADDRESS,
    tonPublicKeyHex: '22'.repeat(32),
    irohaAddress: IROHA_ADDRESS,
    irohaPublicKeyHex: '11'.repeat(32),
  };
}
