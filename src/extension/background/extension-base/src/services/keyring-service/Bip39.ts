import * as bip39 from 'bip39';

export function validateBip39Mnemonic(mnemonic: string[]) {
  return bip39.validateMnemonic(mnemonic.join(' '));
}
