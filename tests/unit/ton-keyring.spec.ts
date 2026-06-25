import vectors from '../../docs/universal-wallet-v2-vectors.json';
import {
  createTonWalletContractV4R2,
  deriveTonAccount,
  deriveTonAddress,
  TON_DEFAULT_DERIVATION_PATH,
  TON_DEFAULT_WORKCHAIN,
  TON_WALLET_VERSION,
  TonKeyringError,
} from '@/util/tonKeyring';

const mnemonic = vectors.vectors[0].mnemonic;
const expected = vectors.vectors[0].expected.ton;

function errorCodeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof TonKeyringError) return error.code;

    throw error;
  }

  throw new Error('expected TonKeyringError');
}

describe('TON keyring derivation', () => {
  it('derives Universal Wallet V2 TON v4r2 accounts from golden vectors', () => {
    for (const vector of vectors.vectors) {
      const account = deriveTonAccount({ mnemonic: vector.mnemonic });
      const { ton } = vector.expected;

      expect(account.derivationPath).toBe(TON_DEFAULT_DERIVATION_PATH);
      expect(account.derivationPath).toBe(ton.derivationPath);
      expect(account.walletVersion).toBe(TON_WALLET_VERSION);
      expect(account.walletVersion).toBe(ton.walletVersion);
      expect(account.workchain).toBe(TON_DEFAULT_WORKCHAIN);
      expect(account.workchain).toBe(ton.workchain);
      expect(account.publicKeyHex).toBe(ton.publicKeyHex);
      expect(account.privateSeedHex).toMatch(/^[0-9a-f]{64}$/);
      expect(account.secretKey).toHaveLength(64);
      expect(account.secretKeyHex).toMatch(/^[0-9a-f]{128}$/);
      expect(account.addressBounceable).toBe(ton.addressBounceable);
      expect(account.addressNonBounceable).toBe(ton.addressNonBounceable);
      expect(account.address).toBe(ton.addressNonBounceable);
      expect(account.testnetNonBounceable).toBe(ton.testnetNonBounceable);
      expect(deriveTonAddress({ mnemonic: vector.mnemonic })).toBe(ton.addressNonBounceable);
    }
  });

  it('supports explicit compatible hardened TON paths without reusing default output', () => {
    const defaultAccount = deriveTonAccount({ mnemonic });
    const alternateAccount = deriveTonAccount({ mnemonic, path: "m/44'/607'/0'/0'/1'" });

    expect(defaultAccount.address).toBe(expected.addressNonBounceable);
    expect(alternateAccount.derivationPath).toBe("m/44'/607'/0'/0'/1'");
    expect(alternateAccount.address).toMatch(/^UQ[A-Za-z0-9_-]{46}$/);
    expect(alternateAccount.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(alternateAccount.address).not.toBe(defaultAccount.address);
    expect(alternateAccount.publicKeyHex).not.toBe(defaultAccount.publicKeyHex);
  });

  it('creates a WalletContractV4-compatible wrapper without changing the derived address', () => {
    const account = deriveTonAccount({ mnemonic });
    const wallet = createTonWalletContractV4R2(account.publicKey);

    expect(wallet.address.toString({ bounceable: false, testOnly: false, urlSafe: true })).toBe(
      expected.addressNonBounceable
    );
    expect(wallet.walletId).toBe(698983191);
    expect(wallet.init.code).toBeDefined();
    expect(wallet.init.data).toBeDefined();
  });

  it('keeps testnet-only address encoding distinct from mainnet receive addresses', () => {
    const account = deriveTonAccount({ mnemonic });

    expect(account.addressNonBounceable).toBe(expected.addressNonBounceable);
    expect(account.testnetNonBounceable).toBe(expected.testnetNonBounceable);
    expect(account.testnetNonBounceable).not.toBe(account.addressNonBounceable);
    expect(account.testnetNonBounceable.startsWith('0Q')).toBe(true);
    expect(account.addressNonBounceable.startsWith('UQ')).toBe(true);
  });

  it('rejects malformed mnemonics, unsafe paths, and unsupported workchains', () => {
    expect(errorCodeOf(() => deriveTonAccount({ mnemonic: 'abandon abandon abandon' }))).toBe('invalid_mnemonic');
    expect(errorCodeOf(() => deriveTonAccount({ mnemonic, path: "44'/607'/0'/0'/0'" }))).toBe(
      'invalid_derivation_path'
    );
    expect(errorCodeOf(() => deriveTonAccount({ mnemonic, path: "m/44'/607'/0'/0'/0" }))).toBe(
      'non_hardened_derivation_path'
    );
    expect(errorCodeOf(() => deriveTonAccount({ mnemonic, path: "m/44'/607'/0'/0'/2147483648'" }))).toBe(
      'invalid_derivation_path_index'
    );
    expect(errorCodeOf(() => deriveTonAccount({ mnemonic, workchain: -1 }))).toBe('unsupported_workchain');
    expect(errorCodeOf(() => createTonWalletContractV4R2(new Uint8Array(32), -1))).toBe('unsupported_workchain');
  });
});
