import { pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from 'bip39';

import { ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';
import { deriveBitcoinKey, deriveBitcoinReceiveAddress } from '@/util/bitcoinKeyring';
import { encodeIrohaI105Address } from '@/util/iroha';
import { deriveIrohaAddress } from '@/util/irohaKeyring';
import { deriveSolanaAccount } from '@/util/solanaKeyring';
import { deriveTonAccount } from '@/util/tonKeyring';
import { deriveUniversalWalletKeyringFields } from '@/util/universalWalletKeyringFields';
import { resolveUniversalWalletPassphrase } from '@/util/universalWalletPassphrase';

// Vectors computed by scripts/generate-universal-wallet-passphrase-vectors.py, which shares no code with the app.
type BitcoinNetworkVector = { accountPath: string; firstReceivePath: string; accountXpub: string; firstReceiveAddress: string };
type IrohaNetworkVector = { publicKeyHex: string; canonicalHex: string; i105: string; chainDiscriminant: number };
type Vector = {
  id: string;
  mnemonic: string;
  wordCount: number;
  passphrase: string;
  passphraseNfkdUtf8Hex: string;
  expected: {
    bitcoin: { mainnet: BitcoinNetworkVector; testnet: BitcoinNetworkVector };
    solana: { derivationPath: string; publicKeyHex: string; address: string };
    ton: {
      derivationPath: string;
      publicKeyHex: string;
      addressBounceable: string;
      addressNonBounceable: string;
      testnetNonBounceable: string;
    };
    iroha: { derivationPath: string; taira: IrohaNetworkVector; nexus: IrohaNetworkVector };
  };
};
type PassphraseSource = {
  id: string;
  substrateDerivationPath: string;
  ethereumPathPassword: string | null;
  passphrase: string;
};

const read = (name: string) => JSON.parse(readFileSync(resolve(__dirname, `../../docs/${name}`), 'utf8'));
const fixture = read('universal-wallet-v2-passphrase-vectors.json') as {
  version: number;
  vectors: Vector[];
  passphraseSources: PassphraseSource[];
  negativeCases: { id: string; reason: string }[];
};
const v2 = read('universal-wallet-v2-vectors.json') as { vectors: { mnemonic: string; expected: Vector['expected'] }[] };

describe('Universal Wallet passphrase vectors', () => {
  it('covers a 12-word and a 24-word phrase, one with a password that NFKD rewrites', () => {
    expect(fixture.version).toBe(1);
    expect(fixture.vectors.map(({ id, wordCount }) => [id, wordCount])).toEqual([
      ['import12-trezor', 12],
      ['default24-unicode', 24],
    ]);
    const unicode = fixture.vectors[1].passphrase;
    expect(unicode.normalize('NFKD')).not.toBe(unicode);
    expect(Buffer.from(unicode.normalize('NFKD'), 'utf8').toString('hex')).toBe(fixture.vectors[1].passphraseNfkdUtf8Hex);
    expect(fixture.negativeCases.map(({ id }) => id)).toEqual([
      'password-ignored',
      'passphrase-not-normalised',
      'path-is-not-password',
    ]);
  });

  it.each(fixture.vectors)('$id derives every Universal Wallet account with the password', (vector) => {
    const { mnemonic, passphrase, expected } = vector;

    for (const network of ['mainnet', 'testnet'] as const) {
      const btc = expected.bitcoin[network];
      const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, passphrase));
      expect(root.derive(btc.accountPath).publicExtendedKey).toBe(btc.accountXpub);
      expect(deriveBitcoinKey({ mnemonicOrSeed: mnemonic, network, passphrase }).path).toBe(btc.firstReceivePath);
      expect(deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonic, network, passphrase })).toBe(btc.firstReceiveAddress);
    }

    const solana = deriveSolanaAccount({ mnemonic, passphrase });
    expect([solana.derivationPath, solana.publicKeyHex, solana.address]).toEqual([
      expected.solana.derivationPath,
      expected.solana.publicKeyHex,
      expected.solana.address,
    ]);

    const ton = deriveTonAccount({ mnemonic, passphrase });
    expect([ton.derivationPath, ton.publicKeyHex, ton.addressBounceable, ton.addressNonBounceable, ton.testnetNonBounceable])
      .toEqual([
        expected.ton.derivationPath,
        expected.ton.publicKeyHex,
        expected.ton.addressBounceable,
        expected.ton.addressNonBounceable,
        expected.ton.testnetNonBounceable,
      ]);

    for (const network of ['taira', 'nexus'] as const) {
      const iroha = deriveIrohaAddress({ mnemonic, passphrase, network });
      expect([iroha.derivationPath, iroha.publicKeyHex, iroha.canonicalHex, iroha.address]).toEqual([
        expected.iroha.derivationPath,
        expected.iroha[network].publicKeyHex,
        expected.iroha[network].canonicalHex,
        expected.iroha[network].i105,
      ]);
      expect(encodeIrohaI105Address(iroha.publicKeyHex, expected.iroha[network].chainDiscriminant)).toBe(
        expected.iroha[network].i105
      );
    }

    expect(deriveUniversalWalletKeyringFields(mnemonic, passphrase)).toEqual({
      bitcoinAddress: expected.bitcoin.mainnet.firstReceiveAddress,
      bitcoinTestnetAddress: expected.bitcoin.testnet.firstReceiveAddress,
      solanaAddress: expected.solana.address,
      tonAddress: expected.ton.addressNonBounceable,
      tonPublicKeyHex: expected.ton.publicKeyHex,
      irohaAddress: expected.iroha.taira.i105,
      irohaPublicKeyHex: expected.iroha.taira.publicKeyHex,
    });
  });

  it.each(fixture.passphraseSources)('$id resolves the passphrase from the wallet paths', (source) => {
    const mnemonic = fixture.vectors[0].mnemonic;
    const ethereumSuri = `${mnemonic}${ETHEREUM_DEFAULT_DERIVATION_PATH}${
      source.ethereumPathPassword === null ? '' : `///${source.ethereumPathPassword}`
    }`;

    expect(resolveUniversalWalletPassphrase(`${mnemonic}${source.substrateDerivationPath}`, ethereumSuri)).toBe(source.passphrase);
  });

  it('keeps every no-password address apart from the protected ones (negative cases)', () => {
    for (const vector of fixture.vectors) {
      const previous = v2.vectors.find(({ mnemonic }) => mnemonic === vector.mnemonic)!.expected;
      const legacy = deriveUniversalWalletKeyringFields(vector.mnemonic);
      const fields = deriveUniversalWalletKeyringFields(vector.mnemonic, vector.passphrase);

      // password-ignored: the empty passphrase gives exactly the v2 accounts, never the protected ones.
      expect(legacy.bitcoinAddress).toBe(previous.bitcoin.mainnet.firstReceiveAddress);
      expect(legacy.solanaAddress).toBe(previous.solana.address);
      expect(legacy.tonPublicKeyHex).toBe(previous.ton.publicKeyHex);
      expect(legacy.irohaPublicKeyHex).toBe(previous.iroha.taira.publicKeyHex);
      for (const key of Object.keys(fields) as (keyof typeof fields)[]) expect(fields[key]).not.toBe(legacy[key]);
      // A listed network keeps the account the words alone open.
      expect(deriveUniversalWalletKeyringFields(vector.mnemonic, vector.passphrase, ['solana'])).toEqual({
        ...fields,
        solanaAddress: legacy.solanaAddress,
      });
    }

    // passphrase-not-normalised: BIP39 salts with the NFKD form, so how the password was typed does not matter,
    // while a client that hashes the typed (NFC) bytes reaches another seed.
    const unicode = fixture.vectors[1];
    expect(mnemonicToSeedSync(unicode.mnemonic, unicode.passphrase.normalize('NFC')))
      .toEqual(mnemonicToSeedSync(unicode.mnemonic, unicode.passphrase.normalize('NFKD')));
    const unnormalised = HDKey.fromMasterSeed(new Uint8Array(pbkdf2Sync(
      Buffer.from(unicode.mnemonic, 'utf8'),
      Buffer.from(`mnemonic${unicode.passphrase}`, 'utf8'),
      2048,
      64,
      'sha512'
    )));
    expect(unnormalised.derive(unicode.expected.bitcoin.mainnet.accountPath).publicExtendedKey).not.toBe(
      unicode.expected.bitcoin.mainnet.accountXpub
    );

    // path-is-not-password: a derivation path alone leaves the passphrase empty.
    expect(resolveUniversalWalletPassphrase(`${unicode.mnemonic}//polkadot`, `${unicode.mnemonic}${ETHEREUM_DEFAULT_DERIVATION_PATH}`))
      .toBe('');
  });
});
