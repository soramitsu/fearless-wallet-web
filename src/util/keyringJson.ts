import { hexToU8a, isHex } from '@polkadot/util';
import { base64Decode } from '@polkadot/util-crypto';
import { entropyToMnemonic } from '@polkadot/util-crypto/mnemonic/bip39';
import { decodePair } from '@subwallet/keyring/pair/decode';
import type { KeyringPair$Json } from '@subwallet/keyring/types';

export function decodeMnemonicFromJsonBackup(json: KeyringPair$Json, password: string): string {
  const encoded = isHex(json.encoded) ? hexToU8a(json.encoded) : base64Decode(json.encoded);
  const decoded = decodePair(password, encoded, json.encoding.type);

  return decoded.entropy?.length ? entropyToMnemonic(decoded.entropy) : '';
}
