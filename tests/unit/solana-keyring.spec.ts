import vectors from '../../docs/universal-wallet-v2-vectors.json';
import {
  deriveSolanaAccount,
  deriveSolanaAddress,
  signSolanaMessage,
  SOLANA_DEFAULT_DERIVATION_PATH,
  SolanaKeyringError,
  verifySolanaMessageSignature,
} from '@/util/solanaKeyring';

const mnemonic = vectors.vectors[0].mnemonic;
const expected = vectors.vectors[0].expected.solana;

function errorCodeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof SolanaKeyringError) return error.code;

    throw error;
  }

  throw new Error('expected SolanaKeyringError');
}

describe('Solana keyring derivation and message signing', () => {
  it('derives Universal Wallet V2 Solana accounts from golden vectors', () => {
    for (const vector of vectors.vectors) {
      const account = deriveSolanaAccount({ mnemonic: vector.mnemonic });

      expect(account.derivationPath).toBe(SOLANA_DEFAULT_DERIVATION_PATH);
      expect(account.publicKeyHex).toBe(vector.expected.solana.publicKeyHex);
      expect(account.address).toBe(vector.expected.solana.address);
      expect(account.privateSeedHex).toMatch(/^[0-9a-f]{64}$/);
      expect(deriveSolanaAddress({ mnemonic: vector.mnemonic })).toBe(vector.expected.solana.address);
    }
  });

  it('signs Solana messages with verifiable Ed25519 signatures', () => {
    const signature = signSolanaMessage({
      message: 'Fearless Solana sign-in challenge',
      mnemonic,
    });

    expect(signature.address).toBe(expected.address);
    expect(signature.derivationPath).toBe(expected.derivationPath);
    expect(signature.publicKeyHex).toBe(expected.publicKeyHex);
    expect(signature.signature).toHaveLength(64);
    expect(signature.signatureHex).toMatch(/^[0-9a-f]{128}$/);
    expect(signature.signatureBase58).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,128}$/);
    expect(
      verifySolanaMessageSignature({
        message: signature.message,
        publicKey: signature.publicKey,
        signature: signature.signature,
      })
    ).toBe(true);
    expect(
      verifySolanaMessageSignature({
        message: 'tampered',
        publicKey: signature.publicKey,
        signature: signature.signature,
      })
    ).toBe(false);
  });

  it('supports explicit compatible hardened Solana paths without reusing default output', () => {
    const defaultAccount = deriveSolanaAccount({ mnemonic });
    const alternateAccount = deriveSolanaAccount({ mnemonic, path: "m/44'/501'/1'/0'" });

    expect(defaultAccount.address).toBe(expected.address);
    expect(alternateAccount.derivationPath).toBe("m/44'/501'/1'/0'");
    expect(alternateAccount.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(alternateAccount.address).not.toBe(defaultAccount.address);
  });

  it('rejects malformed mnemonics, unsafe paths, and unsafe signing payloads', () => {
    expect(errorCodeOf(() => deriveSolanaAccount({ mnemonic: 'abandon abandon abandon' }))).toBe('invalid_mnemonic');
    expect(errorCodeOf(() => deriveSolanaAccount({ mnemonic, path: "44'/501'/0'/0'" }))).toBe(
      'invalid_derivation_path'
    );
    expect(errorCodeOf(() => deriveSolanaAccount({ mnemonic, path: "m/44'/501'/0'/0" }))).toBe(
      'non_hardened_derivation_path'
    );
    expect(errorCodeOf(() => deriveSolanaAccount({ mnemonic, path: "m/44'/501'/0'/2147483648'" }))).toBe(
      'invalid_derivation_path_index'
    );
    expect(errorCodeOf(() => signSolanaMessage({ message: '', mnemonic }))).toBe('empty_message');
    expect(errorCodeOf(() => signSolanaMessage({ message: new Uint8Array(64 * 1024 + 1), mnemonic }))).toBe(
      'message_too_large'
    );
  });
});
