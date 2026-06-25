import vectors from '../../docs/universal-wallet-v2-vectors.json';
import { WalletEcosystem } from '@/interfaces';
import {
  UNIVERSAL_WALLET_KEYRING_META_VERSION,
  buildUniversalWalletKeyringMeta,
  validateUniversalWalletKeyringMeta,
  withUniversalWalletKeyringMeta,
  type UniversalWalletKeyringMeta,
} from '@/util/universalWalletKeyringMeta';

describe('Universal Wallet keyring metadata', () => {
  it('builds a versioned metadata envelope from existing keyring address fields', () => {
    const universalWallet = buildUniversalWalletKeyringMeta({
      address: SUBSTRATE_ADDRESS,
      meta: fullMeta(),
      walletEcosystem: WalletEcosystem.Substrate,
      nowMillis: NOW,
    });

    expect(validateUniversalWalletKeyringMeta(universalWallet)).toEqual([]);
    expect(universalWallet.metaVersion).toBe(UNIVERSAL_WALLET_KEYRING_META_VERSION);
    expect(universalWallet.status).toBe('active');
    expect(universalWallet.primaryEcosystem).toBe(WalletEcosystem.Substrate);
    expect(universalWallet.publicAccounts.map(({ accountId }) => accountId)).toEqual([
      'substrate-default',
      'evm-default',
      'bitcoin-mainnet',
      'bitcoin-testnet',
      'solana-mainnet',
      'ton-mainnet',
      'iroha-taira',
      'iroha-nexus',
    ]);
  });

  it('marks incomplete legacy metadata as migration-required instead of pretending it is universal', () => {
    const meta = withUniversalWalletKeyringMeta(
      SUBSTRATE_ADDRESS,
      {
        name: 'Legacy account',
        ethereumAddress: EVM_ADDRESS,
        walletEcosystem: WalletEcosystem.Substrate,
      },
      WalletEcosystem.Substrate,
      NOW
    );

    expect(meta.universalWallet.status).toBe('migration-required');
    expect(validateUniversalWalletKeyringMeta(meta.universalWallet)).toEqual([]);
    expect(meta.universalWallet.publicAccounts.map(({ ecosystem }) => ecosystem)).toEqual([
      WalletEcosystem.Substrate,
      WalletEcosystem.Evm,
    ]);
  });

  it('preserves existing stable wallet identity fields during metadata updates', () => {
    const original = buildUniversalWalletKeyringMeta({
      address: SUBSTRATE_ADDRESS,
      meta: fullMeta({ name: 'Original' }),
      walletEcosystem: WalletEcosystem.Substrate,
      nowMillis: NOW,
    });

    const updated = buildUniversalWalletKeyringMeta({
      address: SUBSTRATE_ADDRESS,
      meta: {
        ...fullMeta({ name: 'Renamed' }),
        universalWallet: original,
      },
      walletEcosystem: WalletEcosystem.Substrate,
      nowMillis: NOW + 1000,
    });

    expect(updated.walletId).toBe(original.walletId);
    expect(updated.createdAtMillis).toBe(original.createdAtMillis);
    expect(updated.updatedAtMillis).toBe(NOW + 1000);
    expect(updated.displayName).toBe('Renamed');
  });

  it('rejects adversarial embedded metadata and replaces it with a valid envelope', () => {
    const invalid = {
      metaVersion: 999,
      schemaVersion: 999,
      walletId: '../bad',
      displayName: 'bad\u0000name',
      source: 'legacy-import',
      status: 'active',
      primaryEcosystem: 'evil',
      publicAccounts: [],
      createdAtMillis: -1,
    } as unknown as UniversalWalletKeyringMeta;

    expect(validateUniversalWalletKeyringMeta(invalid)).toEqual(
      expect.arrayContaining([
        'invalidMetaVersion',
        'invalidSchemaVersion',
        'invalidWalletId',
        'invalidDisplayName',
        'invalidPrimaryEcosystem',
        'missingPrimaryAccount',
        'invalidTimestamps',
        'publicAccountsRequired',
        'missingActiveEcosystem',
      ])
    );

    const rebuilt = buildUniversalWalletKeyringMeta({
      address: SUBSTRATE_ADDRESS,
      meta: {
        ...fullMeta(),
        universalWallet: invalid,
      },
      walletEcosystem: WalletEcosystem.Substrate,
      nowMillis: NOW,
    });

    expect(validateUniversalWalletKeyringMeta(rebuilt)).toEqual([]);
    expect(rebuilt.walletId).not.toBe('../bad');
  });

  it('normalizes ecosystem-specific primary accounts without copying the wrong address', () => {
    const solana = buildUniversalWalletKeyringMeta({
      address: SOLANA_ADDRESS,
      meta: { name: 'Solana', walletEcosystem: WalletEcosystem.Solana },
      walletEcosystem: WalletEcosystem.Solana,
      nowMillis: NOW,
    });
    const evm = buildUniversalWalletKeyringMeta({
      address: EVM_ADDRESS,
      meta: { name: 'EVM', walletEcosystem: WalletEcosystem.Evm },
      walletEcosystem: WalletEcosystem.Evm,
      nowMillis: NOW,
    });

    expect(solana.publicAccounts).toEqual([
      expect.objectContaining({
        accountId: 'solana-mainnet',
        ecosystem: WalletEcosystem.Solana,
        address: SOLANA_ADDRESS,
      }),
    ]);
    expect(evm.publicAccounts).toEqual([
      expect.objectContaining({
        accountId: 'evm-default',
        ecosystem: WalletEcosystem.Evm,
        address: EVM_ADDRESS,
      }),
    ]);
    expect(validateUniversalWalletKeyringMeta(solana)).toEqual([]);
    expect(validateUniversalWalletKeyringMeta(evm)).toEqual([]);
  });

  it('publishes both Taira and gated Nexus Iroha accounts from one public key', () => {
    const { iroha } = vectors.vectors[0].expected;
    const universalWallet = buildUniversalWalletKeyringMeta({
      address: SUBSTRATE_ADDRESS,
      meta: fullMeta(),
      walletEcosystem: WalletEcosystem.Substrate,
      nowMillis: NOW,
    });

    expect(universalWallet.publicAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: 'iroha-taira',
          ecosystem: WalletEcosystem.Iroha,
          address: iroha.taira.i105,
          chainId: 'iroha3-taira',
          publicKeyHex: iroha.taira.publicKeyHex,
          isDefault: true,
        }),
        expect.objectContaining({
          accountId: 'iroha-nexus',
          ecosystem: WalletEcosystem.Iroha,
          address: iroha.nexus.i105,
          chainId: 'sora:nexus:global',
          publicKeyHex: iroha.nexus.publicKeyHex,
          isDefault: false,
        }),
      ])
    );
    expect(validateUniversalWalletKeyringMeta(universalWallet)).toEqual([]);
  });
});

function fullMeta(overrides: Record<string, unknown> = {}) {
  const { ton, iroha } = vectors.vectors[0].expected;

  return {
    name: 'Fearless Universal',
    walletEcosystem: WalletEcosystem.Substrate,
    ethereumAddress: EVM_ADDRESS,
    bitcoinAddress: BITCOIN_MAINNET_ADDRESS,
    bitcoinTestnetAddress: BITCOIN_TESTNET_ADDRESS,
    solanaAddress: SOLANA_ADDRESS,
    tonAddress: ton.addressNonBounceable,
    tonPublicKeyHex: ton.publicKeyHex,
    irohaAddress: iroha.taira.i105,
    irohaPublicKeyHex: iroha.taira.publicKeyHex,
    ...overrides,
  };
}

const NOW = 1_710_000_000_000;
const SUBSTRATE_ADDRESS = '15FKRtF6nX3SE4PaW4LX69XqYHq2oSep9JX5KF4cgN1XkZ4q';
const EVM_ADDRESS = '0x1111111111111111111111111111111111111111';
const BITCOIN_MAINNET_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const BITCOIN_TESTNET_ADDRESS = 'tb1qfmxy27sn8v4d8jwm23qv0a6tq7cyrtn4gk0q88';
const SOLANA_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
