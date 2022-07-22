import keyring from '@polkadot/ui-keyring';
import { CreateResult } from '@polkadot/ui-keyring/types';
import { isHex } from '@polkadot/util';
import { mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import type { KeyringPair$Json, KeyringPair$Meta, KeyringPair } from '@polkadot/keyring/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { WordCount } from '@polkadot/util-crypto/mnemonic/generate';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { ValidateJsonResult } from '@/interfaces/common';

export default class BaseApi {
  public static generateMnemonic(numWords: WordCount = 12) {
    return mnemonicGenerate(numWords);
  }

  public static isHex(value: string) {
    return isHex(value);
  }

  public static isMnemonic(value: string) {
    return mnemonicValidate(value);
  }

  public static isValidSequenceMnemonic(mnemonic: string, selectedMnemonicElements: string[]) {
    return !mnemonic
      .split(' ')
      .map((mnemonicElement, index) => selectedMnemonicElements[index] === mnemonicElement)
      .includes(false);
  }

  public static isKeyringPairs$Json(json: KeyringPair$Json | KeyringPairs$Json): json is KeyringPairs$Json {
    return json.encoding.content.includes('batch-pkcs8');
  }

  public static addKeypair(suri: string, meta: KeyringPair$Meta, type: KeypairType): CreateResult {
    const pair = keyring.addUri(suri, '', meta, type);

    return pair;
  }

  public static addKeypairFromJson(json: KeyringPair$Json, password: string): KeyringPair {
    const pair = keyring.restoreAccount(json, password);

    return pair;
  }

  public static parseJson(jsonString: string): KeyringPair$Json {
    try {
      return JSON.parse(jsonString) as KeyringPair$Json;
    } catch {
      return {} as KeyringPair$Json;
    }
  }

  public static isValidJson(json: KeyringPair$Json, passwordJson: string): ValidateJsonResult {
    try {
      const pair = keyring.createFromJson(json);

      pair.unlock(passwordJson);

      return { value: true };
    } catch ({ message }) {
      const errorType = message === 'Unable to decode using the supplied passphrase' ? 'jsonPassword' : 'jsonInvalid';

      return { value: false, errorType };
    }
  }
}
