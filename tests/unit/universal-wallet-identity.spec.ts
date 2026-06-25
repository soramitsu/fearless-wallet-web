import { UNIVERSAL_WALLET_DERIVATION_PATHS } from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';
import {
  UNIVERSAL_WALLET_IDENTITY_SCHEMA_VERSION,
  UniversalWalletIdentityError,
  assertUniversalWalletIdentity,
  validateUniversalWalletIdentity,
  type UniversalWalletIdentity,
  type UniversalWalletPublicAccount,
} from '@/util/universalWalletIdentity';

describe('Universal Wallet identity model', () => {
  it('validates and serializes active universal wallet identities', () => {
    const identity = activeIdentity();

    expect(validateUniversalWalletIdentity(identity)).toEqual([]);
    expect(assertUniversalWalletIdentity(identity)).toBe(identity);
    expect(JSON.stringify(identity)).toContain('"schemaVersion":2');
    expect(JSON.stringify(identity)).toContain('"source":"created-24-word"');
    expect(JSON.stringify(identity)).toContain('"status":"active"');
    expect(JSON.stringify(identity)).toContain('"ecosystem":"bitcoin"');
  });

  it('rejects partial active wallets and duplicate accounts', () => {
    const partial = activeIdentity({
      publicAccounts: defaultAccounts().filter(({ ecosystem }) => ecosystem !== WalletEcosystem.Iroha),
    });
    const duplicate = activeIdentity({
      publicAccounts: [...defaultAccounts(), { ...defaultAccounts()[0], address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306abc' }],
    });

    expect(validateUniversalWalletIdentity(partial)).toContain('missingActiveEcosystem');
    expect(validateUniversalWalletIdentity(duplicate)).toContain('duplicateAccountId');
  });

  it('rejects malformed identity and account fields', () => {
    const identity = activeIdentity({
      walletId: 'bad',
      displayName: 'bad\u0000name',
      createdAtMillis: 10,
      updatedAtMillis: 9,
      publicAccounts: [
        {
          accountId: '../bad',
          ecosystem: 'unknown' as WalletEcosystem,
          address: ' bc1bad ',
          chainId: '../bad',
          derivationPath: "m/44'/0'/x",
          publicKeyHex: 'ABC',
          isDefault: true,
        },
      ],
    });

    const errors = validateUniversalWalletIdentity(identity);

    expect(errors).toEqual(
      expect.arrayContaining([
        'invalidWalletId',
        'invalidDisplayName',
        'invalidTimestamps',
        'missingActiveEcosystem',
        'invalidAccountId',
        'invalidEcosystem',
        'invalidAddress',
        'invalidChainId',
        'invalidDerivationPath',
        'invalidPublicKeyHex',
      ])
    );
    expect(() => assertUniversalWalletIdentity(identity)).toThrow(UniversalWalletIdentityError);
  });

  it('enforces legacy export only source and reason', () => {
    const legacy = activeIdentity({
      source: 'legacy-import',
      status: 'legacy-export-only',
      publicAccounts: [defaultAccounts()[0]],
      legacyExportOnlyReason: 'pre-cutoff account export',
    });
    const wrongSource = { ...legacy, source: 'created-24-word' as const };
    const missingReason = { ...legacy, legacyExportOnlyReason: ' ' };
    const activeWithReason = activeIdentity({ legacyExportOnlyReason: 'not allowed' });

    expect(validateUniversalWalletIdentity(legacy)).toEqual([]);
    expect(validateUniversalWalletIdentity(wrongSource)).toContain('invalidLegacySource');
    expect(validateUniversalWalletIdentity(missingReason)).toContain('legacyReasonRequired');
    expect(validateUniversalWalletIdentity(activeWithReason)).toContain('legacyReasonNotAllowed');
  });

  it('allows migration-required identities to be partial but not empty', () => {
    const migrating = activeIdentity({
      status: 'migration-required',
      publicAccounts: [defaultAccounts()[0]],
    });
    const emptyMigrating = activeIdentity({
      status: 'migration-required',
      publicAccounts: [],
    });

    expect(validateUniversalWalletIdentity(migrating)).not.toContain('missingActiveEcosystem');
    expect(validateUniversalWalletIdentity(migrating)).toEqual([]);
    expect(validateUniversalWalletIdentity(emptyMigrating)).toContain('publicAccountsRequired');
  });
});

function activeIdentity(overrides: Partial<UniversalWalletIdentity> = {}): UniversalWalletIdentity {
  return {
    schemaVersion: UNIVERSAL_WALLET_IDENTITY_SCHEMA_VERSION,
    walletId: 'uw2_1234567890abcdef',
    displayName: 'Fearless Universal',
    source: 'created-24-word',
    status: 'active',
    publicAccounts: defaultAccounts(),
    createdAtMillis: 1_710_000_000_000,
    ...overrides,
  };
}

function defaultAccounts(): UniversalWalletPublicAccount[] {
  return [
    {
      accountId: 'substrate-polkadot',
      ecosystem: WalletEcosystem.Substrate,
      address: '15FKRtF6nX3SE4PaW4LX69XqYHq2oSep9JX5KF4cgN1XkZ4q',
      chainId: 'polkadot',
      derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.substrateRoot,
      publicKeyHex: HEX_32,
      isDefault: true,
    },
    {
      accountId: 'evm-default',
      ecosystem: WalletEcosystem.Evm,
      address: '0x1111111111111111111111111111111111111111',
      chainId: 'eip155:1',
      derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.evmDefault,
      isDefault: true,
    },
    {
      accountId: 'bitcoin-mainnet',
      ecosystem: WalletEcosystem.Bitcoin,
      address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      chainId: 'bitcoin:mainnet',
      derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinMainnetFirstReceive,
      isDefault: true,
    },
    {
      accountId: 'solana-mainnet',
      ecosystem: WalletEcosystem.Solana,
      address: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
      chainId: 'solana:mainnet',
      derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.solanaDefault,
      publicKeyHex: HEX_32,
      isDefault: true,
    },
    {
      accountId: 'ton-mainnet',
      ecosystem: WalletEcosystem.Ton,
      address: 'UQDxAUFadQXDd3EXGa3TLF_EF66gMc9h3_aZ0j0zXNoIYUCc',
      chainId: 'ton:mainnet',
      derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.tonDefault,
      publicKeyHex: HEX_32,
      isDefault: true,
    },
    {
      accountId: 'iroha-taira',
      ecosystem: WalletEcosystem.Iroha,
      address: 'testuﾛ1Pcﾅ2ﾗtﾉaﾘLﾕｽ2MヱﾐﾎｳﾓヱﾇﾆｲMﾒSﾏﾑヱﾇJヱFmJﾇMs6YN687Y',
      chainId: 'iroha3-taira',
      derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.irohaDefault,
      publicKeyHex: HEX_32,
      isDefault: true,
    },
  ];
}

const HEX_32 = '11'.repeat(32);
