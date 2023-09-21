import {
  decodeAddress,
  encodeAddress,
  mnemonicGenerate,
  mnemonicValidate,
  hdValidatePath,
  isEthereumAddress,
} from '@polkadot/util-crypto';
import { isHex, bnToBn, formatNumber } from '@polkadot/util';
import type { AccountJson } from '@extension-base/background/types/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type { ValidateJsonResult, DerivationPath } from '@/interfaces';
import type { Wallet } from '@/store';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { isDerivationPathValid, isJsonValid, jsonRestore } from '@/extension/messaging';
import { ETHEREUM_NETWORKS, NATIVE_ETHEREUM_NETWORKS } from '@/consts/networks';
import { NetworksController } from '@/controllers';
import store from '@/store';
import { IS_EXTENSION } from '@/consts/global';

type WordCount = 12 | 15 | 18 | 21 | 24;
type WalletTypes = 'mobile' | 'native';

export default class BaseApi {
  public static getWalletType(address: string): WalletTypes | null {
    const substrateAddress = BaseApi.encodeAddress(address);
    const accounts = store.getters.getAccounts as AccountJson[];
    const account = accounts.find(({ address }) => address === substrateAddress);

    if (account === undefined) return null;

    return account.isMobile ? 'mobile' : 'native';
  }

  public static mortalityDecode(era: ExtrinsicEra, hexBlockNumber: string) {
    const blockNumber = bnToBn(hexBlockNumber);
    const mortal = era.asMortalEra;
    const birth = formatNumber(mortal.birth(blockNumber));
    const death = formatNumber(mortal.death(blockNumber));

    return { birth, death };
  }

  public static generateMnemonic(numWords: WordCount = 12): string {
    return mnemonicGenerate(numWords);
  }

  public static isHex(value: string): boolean {
    return isHex(value);
  }

  public static isValidPhrase(value: string): boolean {
    return mnemonicValidate(value);
  }

  public static async isValidSubstrateDerivationPath({ value, keypairType }: DerivationPath): Promise<boolean> {
    return await isDerivationPathValid({ value, keypairType });
  }

  public static isValidEthereumDerivationPath(value: string): boolean {
    return hdValidatePath(value);
  }

  public static isValidSequenceMnemonic(mnemonic: string, selectedMnemonicElements: string[]): boolean {
    return mnemonic
      .split(' ')
      .map((mnemonicElement, index) => selectedMnemonicElements[index] === mnemonicElement)
      .every((item) => item);
  }

  public static isKeyringPairs$Json(json: KeyringPair$Json | KeyringPairs$Json): json is KeyringPairs$Json {
    return json.encoding.content.includes('batch-pkcs8');
  }

  public static async addKeypairFromJson(json: KeyringPair$Json, password: string): Promise<string> {
    return jsonRestore(json, password); // for proper work of extension
  }

  public static isDuplicateKeypair(address: string): boolean {
    const accounts = BaseApi.getAccounts();

    return accounts.map(({ address }) => address).includes(address);
  }

  //TEMP FOR TESTING
  public static getAccounts(): { address: string }[] {
    return (store.getters.getAccounts as AccountJson[]).map(({ address }) => {
      return { address };
    });
  }

  public static isMobileWallet(address: string) {
    return (store.getters.getAccounts as AccountJson[]).some(
      (account) => account.address === address && account.isMobile
    );
  }

  public static isEthereumNetwork(network: string): boolean {
    return ETHEREUM_NETWORKS.includes(network.toLowerCase());
  }

  public static isEthereumNativeNetwork(network: string): boolean {
    return NATIVE_ETHEREUM_NETWORKS.includes(network.toLowerCase());
  }

  public static parseJson(jsonString: string): KeyringPair$Json {
    try {
      return JSON.parse(jsonString) as KeyringPair$Json;
    } catch {
      return {} as KeyringPair$Json;
    }
  }

  public static async isValidJson(
    json: KeyringPair$Json,
    passwordJson: string,
    isSubstrate = true
  ): Promise<ValidateJsonResult> {
    return await isJsonValid(json, passwordJson, isSubstrate);
  }

  public static decodeAddress(address: string): Uint8Array {
    return decodeAddress(address, false);
  }

  public static isEthereumAddress(address: string): boolean {
    return isEthereumAddress(address);
  }

  public static isSameAddress(wallet: Wallet, address: string, network: string): boolean {
    return BaseApi.formatAddress(wallet, network) === address;
  }

  public static validateAddress(address: string, network: string): boolean {
    const isEthereumNetwork = BaseApi.isEthereumNetwork(network);

    if (isEthereumNetwork && !BaseApi.isEthereumAddress(address)) return false;

    if (!isEthereumNetwork && BaseApi.isEthereumAddress(address)) return false;

    try {
      const publicKey = BaseApi.decodeAddress(address);

      if (!isEthereumNetwork) BaseApi.encodeAddress(publicKey);

      return true;
    } catch (e) {
      console.info(e);

      return false;
    }
  }

  public static validateAddressByNetwork(address: string, network: string): boolean {
    if (BaseApi.isEthereumNetwork(network)) return BaseApi.isEthereumAddress(address);

    return address === BaseApi.formatAddress({ address, ethereumAddress: address }, network);
  }

  public static formatAddress({ address, ethereumAddress }: Wallet, networkName: string): string {
    const isEthereumNetwork = BaseApi.isEthereumNetwork(networkName);

    if (isEthereumNetwork) return ethereumAddress;

    const network = NetworksController.getNetwork(networkName);
    const prefix = network?.addressPrefix;

    // the only case for try/catch
    // if the user used ethereum account instead of a substratum account(via json or private key)
    try {
      return BaseApi.encodeAddress(address, prefix);
    } catch {
      return ethereumAddress;
    }
  }

  public static encodeAddress(publicKey: string | Uint8Array, prefix = 42) {
    try {
      return encodeAddress(publicKey, prefix);
    } catch {
      // dot ETH addresses
      return publicKey as string;
    }
  }

  public static useIsPopup(): boolean {
    return window.innerWidth <= 561 && IS_EXTENSION;
  }
}
