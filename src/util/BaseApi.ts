import { keyring } from '@polkadot/ui-keyring';
import { decodeAddress, encodeAddress, mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import { isHex } from '@polkadot/util';
import { KeyringAddress } from '@polkadot/ui-keyring/types';
import type { KeyringPair$Json, KeyringPair$Meta, KeyringPair } from '@polkadot/keyring/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { ValidateJsonResult } from '@/interfaces/common';
import type { Wallet } from '@/store/accounts/types';
import { createAccountSuri, jsonRestore } from '@/extension/messaging';
import { getReplacedMetaTyped } from '@/util/helpers';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import NetworksController from '@/controllers/networksController';

type WordCount = 12 | 15 | 18 | 21 | 24;

export default class BaseApi {
  private static createFromJson(json: KeyringPair$Json): KeyringPair {
    const pair = keyring.createFromJson(json);

    return pair;
  }

  private static updateReplacedMetaData(address: string, parentAddressProp: string, network: string): void {
    const pair = BaseApi.getKeyringPair(address);
    const meta = getReplacedMetaTyped(pair.meta);
    const oldReplacedSettings = meta.replacedSettings;
    const oldNetworksList = oldReplacedSettings[parentAddressProp];
    const newNetworksList = [...oldNetworksList, network];

    meta.replacedSettings[parentAddressProp] = newNetworksList;

    keyring.saveAccountMeta(pair, meta as any);
  }

  private static checkAndReplaceDuplicateAccount(
    address: string,
    parentAddress: string,
    network: string
  ): Record<'replaced', boolean> {
    const isDuplicateReplacedKeypair = BaseApi.isDuplicateReplacedKeypair(address);
    const isDuplicateKeypair = BaseApi.isDuplicateKeypair(address);

    if (isDuplicateReplacedKeypair) {
      BaseApi.updateReplacedMetaData(address, parentAddress, network);

      return { replaced: true };
    }

    // when a user tries to replace an account with the same account
    // this is wrong, it is not necessary to do so to avoid mistakes
    if (isDuplicateKeypair) {
      throw new Error('Such an account already exists');
    }

    return { replaced: false };
  }

  private static getWalletIncludingReplacedAccount(wallet: Wallet, network: string): Wallet {
    const replacedAccountByNetwork = BaseApi.getReplacedAccountByNetwork(wallet, network);
    const address = replacedAccountByNetwork?.address;

    return address ? ({ address, ethereumAddress: address } as Wallet) : wallet;
  }

  public static createFromUri(suri: string, type: KeypairType): KeyringPair {
    const pair = keyring.createFromUri(suri, {}, type);

    return pair;
  }

  public static getReplacedAccounts({ address, ethereumAddress }: Wallet): KeyringPair[] {
    return BaseApi.getAccounts()
      .filter(({ meta }) => {
        const { isReplacedAccount, replacedSettings } = getReplacedMetaTyped(meta);

        if (!isReplacedAccount) return false;

        const hasAddress = Object.prototype.hasOwnProperty.call(replacedSettings, address);
        const hasEthereumAddress = Object.prototype.hasOwnProperty.call(replacedSettings, ethereumAddress);

        return hasAddress || hasEthereumAddress;
      })
      .map(({ address }) => BaseApi.getPair(address));
  }

  public static getReplacedAccountByNetwork(wallet: Wallet, network: string): KeyringPair | undefined {
    return BaseApi.getReplacedAccounts(wallet).find(({ meta }) => {
      const { address, ethereumAddress } = wallet;
      const { replacedSettings } = getReplacedMetaTyped(meta);
      const networksList = replacedSettings[address] ?? replacedSettings[ethereumAddress];

      return networksList.includes(network);
    });
  }

  public static getDefaultAddressByNetworkIncludingReplacedAccount(_wallet: Wallet, network: string): string {
    const wallet = BaseApi.getWalletIncludingReplacedAccount(_wallet, network);
    const { address, ethereumAddress } = wallet;
    const isEthereumNetwork = ETHEREUM_NETWORKS.includes(network);
    const addressByNetwork = isEthereumNetwork ? ethereumAddress : address;

    return addressByNetwork;
  }

  /**
   * Get the address to display to the user, taking into account the network and replaced the account
   * @param {Wallet} wallet
   * @param {string} network
   */
  public static getDisplayAddressByNetwork(wallet: Wallet, network: string): string {
    const defaultWallet = BaseApi.getWalletIncludingReplacedAccount(wallet, network);

    return BaseApi.formatAddress(defaultWallet, network);
  }

  public static generateMnemonic(numWords: WordCount = 12): string {
    return mnemonicGenerate(numWords);
  }

  public static isHex(value: string): boolean {
    return isHex(value);
  }

  public static isMnemonic(value: string): boolean {
    return mnemonicValidate(value);
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

  public static addKeypair(suri: string, password: string, meta: KeyringPair$Meta, type: KeypairType): KeyringPair {
    const { pair } = keyring.addUri(suri, password, meta, type);
    const name = meta.name as string;

    createAccountSuri(name, password, suri, type); //for proper work of extension

    return pair;
  }

  public static replaceAccountFromJson(
    json: KeyringPair$Json,
    password: string,
    parentAddress: string,
    network: string
  ): void {
    const { address } = BaseApi.createFromJson(json);
    const { replaced } = BaseApi.checkAndReplaceDuplicateAccount(address, parentAddress, network);

    if (replaced) return;

    json.meta.isReplacedAccount = true;
    json.meta.replacedSettings = {
      [parentAddress]: [network],
    };

    keyring.restoreAccount(json, password);
    jsonRestore(json, password); //for proper work of extension
  }

  public static replaceAccountFromSeed(
    suri: string,
    password: string,
    type: KeypairType,
    parentAddress: string,
    network: string
  ): void {
    const meta: Record<string, unknown> = {};
    const { address } = BaseApi.createFromUri(suri, type);
    const { replaced } = BaseApi.checkAndReplaceDuplicateAccount(address, parentAddress, network);

    if (replaced) return;

    meta.isReplacedAccount = true;
    meta.replacedSettings = {
      [parentAddress]: [network],
    };

    BaseApi.addKeypair(suri, password, meta, type);
  }

  public static isDuplicateKeypair(address: string): boolean {
    const accounts = BaseApi.getAccounts();

    return accounts.map(({ address }) => address).includes(address);
  }

  public static getAccounts(): KeyringAddress[] {
    return keyring.getAccounts();
  }

  public static getPolkadotAddresses(): string[] {
    return keyring
      .getAccounts()
      .filter((el) => el.address.startsWith('5'))
      .map((el) => el.address);
  }

  public static getPair(address: string): KeyringPair {
    return keyring.getPair(address);
  }

  public static isDuplicateReplacedKeypair(addressProp: string): boolean {
    const accounts = BaseApi.getAccounts();
    const index = accounts.findIndex(({ address, meta }) => address === addressProp && meta.isReplacedAccount === true);

    return index !== -1;
  }

  public static getKeyringPair(address: string): KeyringPair {
    return keyring.getPair(address);
  }

  public static addKeypairFromJson(json: KeyringPair$Json, password: string): KeyringPair {
    const pair = keyring.restoreAccount(json, password);
    jsonRestore(json, password);

    return pair;
  }

  public static isEthereumNetwork(network: string): boolean {
    return ETHEREUM_NETWORKS.includes(network);
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
      const pair = BaseApi.createFromJson(json);

      pair.unlock(passwordJson);

      return { value: true };
    } catch ({ message }) {
      const errorType = message === 'Unable to decode using the supplied passphrase' ? 'jsonPassword' : 'jsonInvalid';

      return { value: false, errorType };
    }
  }

  public static decodeAddress(address: string): Uint8Array {
    return decodeAddress(address, false);
  }

  public static validateAddress(address: string): boolean {
    try {
      this.decodeAddress(address);

      return true;
    } catch {
      return false;
    }
  }

  public static formatAddress({ address, ethereumAddress }: Wallet, networkName: string): string {
    const isEthereumNetwork = BaseApi.isEthereumNetwork(networkName);

    if (isEthereumNetwork) return ethereumAddress;

    const publicKey = this.decodeAddress(address);
    const networks = NetworksController.getNetworks();
    const network = networks.find(({ name }) => name === networkName);
    const prefix = network?.addressPrefix;

    return encodeAddress(publicKey, prefix);
  }

  public static unlockPair(from: string, password: string): void {
    const pair = keyring.getPair(from);

    pair.unlock(password);
  }
}
