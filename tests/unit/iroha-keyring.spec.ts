import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { UNIVERSAL_WALLET_DERIVATION_PATHS } from '@/consts/universalWallet';
import { deriveIrohaAccount, deriveIrohaAddress, IROHA_DEFAULT_DERIVATION_PATH } from '@/util/irohaKeyring';

type Vector = {
  mnemonic: string;
  expected: {
    iroha: {
      derivationPath: string;
      taira: {
        publicKeyHex: string;
        canonicalHex: string;
        i105: string;
      };
      nexus: {
        publicKeyHex: string;
        canonicalHex: string;
        i105: string;
      };
    };
  };
};

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')
) as {
  vectors: Vector[];
};

describe('Iroha SLIP-0010 key derivation', () => {
  it('derives Iroha Ed25519 public keys and I105 addresses from golden mnemonics', () => {
    expect(IROHA_DEFAULT_DERIVATION_PATH).toBe(UNIVERSAL_WALLET_DERIVATION_PATHS.irohaDefault);

    for (const vector of fixture.vectors) {
      const { iroha } = vector.expected;
      const account = deriveIrohaAccount({ mnemonic: vector.mnemonic });

      expect(account).toEqual({
        derivationPath: iroha.derivationPath,
        publicKeyHex: iroha.taira.publicKeyHex,
        canonicalHex: iroha.taira.canonicalHex,
      });
      expect(deriveIrohaAddress({ mnemonic: vector.mnemonic, network: 'taira' }).address).toBe(iroha.taira.i105);
      expect(deriveIrohaAddress({ mnemonic: vector.mnemonic, network: 'nexus' }).address).toBe(iroha.nexus.i105);
      expect(iroha.taira.publicKeyHex).toBe(iroha.nexus.publicKeyHex);
      expect(iroha.taira.canonicalHex).toBe(iroha.nexus.canonicalHex);
    }
  });

  it('rejects invalid mnemonics and non-hardened or malformed derivation paths', () => {
    const mnemonic = fixture.vectors[0].mnemonic;

    expect(() => deriveIrohaAccount({ mnemonic: 'abandon abandon abandon' })).toThrow('Invalid Iroha mnemonic');
    expect(() => deriveIrohaAccount({ mnemonic, path: "m/44'/617'/0'/0" })).toThrow(
      'Iroha derivation path must use hardened segments only'
    );
    expect(() => deriveIrohaAccount({ mnemonic, path: "44'/617'/0'/0'" })).toThrow('Invalid Iroha derivation path');
  });
});
