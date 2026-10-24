import { mnemonicToPrivateKey, sign, signVerify } from '@ton/crypto';
import * as tonWebMnemonic from 'tonweb-mnemonic';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import legacyVectors from '../fixtures/ton/ton-bip39-3.0.5-vectors.json';
import {
  createTonWalletContractV4R2,
  deriveTonAccount,
  deriveTonAddress,
  deriveCompatibleTonKeyPair,
  TON_DEFAULT_DERIVATION_PATH,
  TON_DEFAULT_WORKCHAIN,
  TON_WALLET_VERSION,
  TonKeyringError,
  verifyTonPhrase,
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
  // Public TonSwift upstream mnemonic test vector, also used by iOS upgrade tests.
  const nativePhrase = 'cluster notice abandon frost gospel boring element situate click mix vague replace imitate garment useful crater resource dose tenant theme foam ancient phrase slight';
  const nativePublicKey = '34eb4b67d64f74d989ce2bc2e3dfddb7ed4cb0eec92f29fbecd05b1eabab0254';

  it('preserves released native TON signing keys without treating the phrase as BIP39', async () => {
    const restored = await deriveCompatibleTonKeyPair(nativePhrase.split(' '), Buffer.from(nativePublicKey, 'hex'));
    expect(Buffer.from(restored.publicKey).toString('hex')).toBe(nativePublicKey);
    const payload = Buffer.from('public legacy TON upgrade fixture');
    expect(signVerify(payload, sign(payload, Buffer.from(restored.secretKey)), Buffer.from(restored.publicKey))).toBe(true);
    expect((await deriveCompatibleTonKeyPair(nativePhrase.split(' '))).publicKey).toEqual(restored.publicKey);
  });

  it('keeps universal TON derivation for its matching existing account', async () => {
    const restored = await deriveCompatibleTonKeyPair(mnemonic.split(' '), Buffer.from(expected.publicKeyHex, 'hex'));
    expect(Buffer.from(restored.publicKey).toString('hex')).toBe(expected.publicKeyHex);
  });

  it('refuses signing with a valid phrase belonging to a different stored account', async () => {
    await expect(deriveCompatibleTonKeyPair(nativePhrase.split(' '), new Uint8Array(32))).rejects.toMatchObject({ code: 'account_key_mismatch' });
    await expect(deriveCompatibleTonKeyPair(['invalid'])).rejects.toMatchObject({ code: 'invalid_mnemonic' });
  });

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

describe('3.0.x legacy TON derivation', () => {
  // Fearless 3.0.1-3.0.5 ran tonweb's KDF over every imported phrase, BIP39 phrases included.
  const realBuildPhrase = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
  const realBuildAddress = 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44';
  const payload = Buffer.from('3.0.x legacy TON signing fixture');
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
  const nonBounceable = (publicKey: Uint8Array) =>
    createTonWalletContractV4R2(publicKey).address.toString({ bounceable: false, testOnly: false, urlSafe: true });

  it('restores the 3.0.x signing key for BIP39 phrases that fail TON validation', async () => {
    for (const phrase of [...vectors.vectors.map(({ mnemonic: words }) => words), realBuildPhrase]) {
      const words = phrase.split(' ');
      expect(await tonWebMnemonic.validateMnemonic(words)).toBe(false);
      // @ton/crypto is an independent implementation of the same TON KDF.
      const expectedKey = await mnemonicToPrivateKey(words);
      expect(hex((await tonWebMnemonic.mnemonicToKeyPair(words)).publicKey)).toBe(hex(expectedKey.publicKey));

      const restored = await deriveCompatibleTonKeyPair(words, Uint8Array.from(expectedKey.publicKey));

      expect(hex(restored.publicKey)).toBe(hex(expectedKey.publicKey));
      expect(signVerify(payload, sign(payload, Buffer.from(restored.secretKey)), expectedKey.publicKey)).toBe(true);
      expect(await verifyTonPhrase(words, Uint8Array.from(expectedKey.publicKey))).toBe(true);
    }
  });

  it('matches the address the real 3.0.5 build stored for a BIP39 TON import', async () => {
    expect(await tonWebMnemonic.validateMnemonic(realBuildPhrase.split(' '))).toBe(false);
    const legacy = await tonWebMnemonic.mnemonicToKeyPair(realBuildPhrase.split(' '));
    const restored = await deriveCompatibleTonKeyPair(realBuildPhrase.split(' '), legacy.publicKey);

    expect(nonBounceable(restored.publicKey)).toBe(realBuildAddress);
  });

  it('restores every account generated by the 3.0.5 libraries', async () => {
    expect(legacyVectors.source.realBuildAddress).toBe(realBuildAddress);
    expect(legacyVectors.vectors[0]).toMatchObject({ mnemonic: realBuildPhrase, address: realBuildAddress });
    expect(legacyVectors.vectors.length).toBeGreaterThanOrEqual(48);
    expect(new Set(legacyVectors.vectors.map(({ mnemonic: words }) => words.split(' ').length))).toEqual(
      new Set([12, 15, 18, 21, 24])
    );

    for (const vector of legacyVectors.vectors) {
      expect(vector.tonwebValid).toBe(false);
      const restored = await deriveCompatibleTonKeyPair(vector.mnemonic.split(' '), Buffer.from(vector.publicKeyHex, 'hex'));

      expect(hex(restored.publicKey)).toBe(vector.publicKeyHex);
      expect(nonBounceable(restored.publicKey)).toBe(vector.address);
      expect(signVerify(payload, sign(payload, Buffer.from(restored.secretKey)), Buffer.from(restored.publicKey))).toBe(true);
    }
  }, 60_000);

  it('keeps new BIP39 imports on the universal derivation', async () => {
    const words = mnemonic.split(' ');
    const legacy = await tonWebMnemonic.mnemonicToKeyPair(words);
    const created = await deriveCompatibleTonKeyPair(words);

    expect(hex(created.publicKey)).toBe(expected.publicKeyHex);
    expect(hex(legacy.publicKey)).not.toBe(expected.publicKeyHex);
    expect(hex((await deriveCompatibleTonKeyPair(words, Buffer.from(expected.publicKeyHex, 'hex'))).publicKey)).toBe(
      expected.publicKeyHex
    );
  });

  it('refuses legacy keys that do not match the stored account', async () => {
    const realBuildKey = await tonWebMnemonic.mnemonicToKeyPair(realBuildPhrase.split(' '));
    const otherLegacyKey = Buffer.from(legacyVectors.vectors[1].publicKeyHex, 'hex');

    await expect(deriveCompatibleTonKeyPair(realBuildPhrase.split(' '), otherLegacyKey)).rejects.toMatchObject({
      code: 'account_key_mismatch',
    });
    await expect(deriveCompatibleTonKeyPair(realBuildPhrase.split(' '), new Uint8Array(32))).rejects.toMatchObject({
      code: 'account_key_mismatch',
    });
    // A wrong-password decrypt yields '' or garbage: tonweb still computes a key, which must not match.
    for (const garbage of [[], [''], ['', ''], ['\u0000\u0007'], ['invalid']]) {
      await expect(deriveCompatibleTonKeyPair(garbage, realBuildKey.publicKey)).rejects.toMatchObject({
        code: 'account_key_mismatch',
      });
      expect(await verifyTonPhrase(garbage, realBuildKey.publicKey)).toBe(false);
    }
    await expect(deriveCompatibleTonKeyPair(['invalid'])).rejects.toMatchObject({ code: 'invalid_mnemonic' });
    await expect(deriveCompatibleTonKeyPair([''])).rejects.toMatchObject({ code: 'invalid_mnemonic' });
    await expect(deriveCompatibleTonKeyPair(realBuildPhrase.split(' ').reverse())).rejects.toMatchObject({
      code: 'invalid_mnemonic',
    });
    expect(await verifyTonPhrase(realBuildPhrase.split(' '), otherLegacyKey)).toBe(false);
  });

  it('replays the exact stored words, so normalising them would lose the key', async () => {
    // 3.0.x split the phrase on single spaces, so irregular spacing is stored as empty words.
    const storedWords = realBuildPhrase.replace('legal winner', 'legal  winner').split(' ');
    const normalisedWords = realBuildPhrase.split(' ');
    expect(storedWords).toContain('');
    const storedKey = await tonWebMnemonic.mnemonicToKeyPair(storedWords);

    const restored = await deriveCompatibleTonKeyPair(storedWords, storedKey.publicKey);

    expect(hex(restored.publicKey)).toBe(hex(storedKey.publicKey));
    expect(signVerify(payload, sign(payload, Buffer.from(restored.secretKey)), Buffer.from(storedKey.publicKey))).toBe(true);
    await expect(deriveCompatibleTonKeyPair(normalisedWords, storedKey.publicKey)).rejects.toMatchObject({
      code: 'account_key_mismatch',
    });
    expect(await verifyTonPhrase(normalisedWords, storedKey.publicKey)).toBe(false);
    expect(await verifyTonPhrase(storedWords, storedKey.publicKey)).toBe(true);
  });

  it('keeps password-protected native phrases on the native path', async () => {
    // Generated once with tonweb-mnemonic generateMnemonic(24, password).
    const words = 'connect reject increase cup pear daughter spirit proof quality blur damage calm despair wild enough inside lock analyst hungry coin bundle east hero rule'.split(' ');
    const password = 'legacy TON fixture password';
    const nativePublicKey = Buffer.from('345301493fa302523661192ec1329c3951bfa41ee44cf4b306939764f3b5203f', 'hex');
    expect(await tonWebMnemonic.isPasswordNeeded(words)).toBe(true);

    const restored = await deriveCompatibleTonKeyPair(words, nativePublicKey, password);

    expect(hex(restored.publicKey)).toBe(hex(nativePublicKey));
    expect(signVerify(payload, sign(payload, Buffer.from(restored.secretKey)), nativePublicKey)).toBe(true);
    // Without the password the legacy KDF yields a different key, which must not be accepted.
    await expect(deriveCompatibleTonKeyPair(words, nativePublicKey)).rejects.toMatchObject({
      code: 'account_key_mismatch',
    });
  });
});
