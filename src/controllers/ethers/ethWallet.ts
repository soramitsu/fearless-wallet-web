import { ethers } from 'ethers';
type TProgressCallback = ethers.utils.ProgressCallback | undefined;
type TWallet = ethers.Wallet;

export default class EthWallet {
  static createRandom(): TWallet {
    return ethers.Wallet.createRandom();
  }

  static createFromMnemonic(mnemonic: string, path?: string, wordList?: ethers.Wordlist): TWallet {
    return ethers.Wallet.fromMnemonic(mnemonic, path, wordList);
  }

  static createFromJson(json: string, password: string, progressCallback?: TProgressCallback): Promise<TWallet> {
    return ethers.Wallet.fromEncryptedJson(json, password, progressCallback);
  }

  static isSigner(value: unknown): boolean {
    return ethers.Wallet.isSigner(value);
  }
}
