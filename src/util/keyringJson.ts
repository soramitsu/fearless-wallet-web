import { hexToU8a, isHex, u8aEq } from '@polkadot/util';
import { base64Decode } from '@polkadot/util-crypto';
import { entropyToMnemonic } from '@polkadot/util-crypto/mnemonic/bip39';
import { decodePair } from '@subwallet/keyring/pair/decode';
import type { KeyringPair$Json } from '@subwallet/keyring/types';

export function decodeMnemonicFromJsonBackup(json: KeyringPair$Json, password: string, expectedPublicKey?: Uint8Array): string {
  const encoded = isHex(json.encoded) ? hexToU8a(json.encoded) : base64Decode(json.encoded);
  const decoded = decodePair(password, encoded, json.encoding.type);

  try {
    if (expectedPublicKey && !u8aEq(decoded.publicKey, expectedPublicKey)) {
      throw new Error('Encrypted account public key does not match the selected account.');
    }
    return decoded.entropy?.length ? entropyToMnemonic(decoded.entropy) : '';
  } finally {
    decoded.secretKey.fill(0);
    decoded.entropy?.fill(0);
  }
}
