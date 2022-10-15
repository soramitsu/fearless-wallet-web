import { keyring } from '@polkadot/ui-keyring';
import {
  decodeAddress,
  encodeAddress,
  mnemonicGenerate,
  mnemonicValidate,
  hdValidatePath,
  evmToAddress,
} from '@polkadot/util-crypto';
import { isHex, bnToBn, formatNumber } from '@polkadot/util';
import { KeyringAddress } from '@polkadot/ui-keyring/types';
import { assetFromToken } from '@equilab/api';
import { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import { BehaviorSubject } from 'rxjs';
import type { KeyringPair$Json, KeyringPair$Meta, KeyringPair } from '@polkadot/keyring/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { ValidateJsonResult, DerivationPath } from '@/interfaces';
import type { Wallet } from '@/store/accounts/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { createAccountSuri, jsonRestore } from '@/extension/messaging';
import { getReplacedMetaTyped, getMetaTyped, isExtension } from '@/helpers/common';
import { ETHEREUM_NETWORKS } from '@/consts/networks';
import NetworksController from '@/controllers/networksController';
import { VALID_MNEMONIC } from '@/consts/derivationPath';
import { beaconController } from '@/controllers/beaconController';

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

  public static saveAddress(address: string, meta: KeyringPair$Meta) {
    return keyring.saveAddress(address, meta, 'address');
  }

  public static forgetAddress(address: string) {
    keyring.forgetAddress(address);
  }

  public static getAddressType(address: string) {
    const substrateAddress = encodeAddress(address, 42);

    if (BaseApi.getAddress(substrateAddress)) return 'address';
    if (BaseApi.getAccount(substrateAddress)) return 'account';

    return null;
  }

  public static mortalityDecode(era: ExtrinsicEra, hexBlockNumber: string) {
    const blockNumber = bnToBn(hexBlockNumber);
    const mortal = era.asMortalEra;
    const birth = formatNumber(mortal.birth(blockNumber));
    const death = formatNumber(mortal.death(blockNumber));

    return { birth, death };
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
    const { address, ethereumAddress } = wallet;

    return BaseApi.getReplacedAccounts(wallet).find(({ meta }) => {
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

  public static isValidPhrase(value: string): boolean {
    return mnemonicValidate(value);
  }

  public static isValidSubstrateDerivationPath({ value, keypairType }: DerivationPath): boolean {
    try {
      BaseApi.createFromUri(`${VALID_MNEMONIC}${value}`, keypairType);

      return true;
    } catch {
      return false;
    }
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

  public static addKeypair(suri: string, password: string, meta: KeyringPair$Meta, type: KeypairType): KeyringPair {
    const { pair } = keyring.addUri(suri, password, meta, type);
    const name = meta.name as string;

    createAccountSuri(name, password, suri, type); //for proper work of extension

    return pair;
  }

  public static addKeypairFromJson(json: KeyringPair$Json, password: string): KeyringPair {
    const pair = keyring.restoreAccount(json, password);

    jsonRestore(json, password); //for proper work of extension

    return pair;
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

  public static isDuplicateKeypair(address: string): boolean {
    const accounts = BaseApi.getAccounts();

    return accounts.map(({ address }) => address).includes(address);
  }

  public static getAccount(address: string): KeyringAddress | undefined {
    return keyring.getAccount(address);
  }

  public static getAccounts(): KeyringAddress[] {
    return keyring.getAccounts();
  }

  public static getAddress(address: string): KeyringAddress | undefined {
    return keyring.getAddress(address, 'address');
  }

  public static getAddresses(): KeyringAddress[] {
    return keyring.getAddresses();
  }

  public static getAccountsSubject(): BehaviorSubject<SubjectInfo> {
    return keyring.accounts.subject;
  }

  public static getAddressesSubject(): BehaviorSubject<SubjectInfo> {
    return keyring.addresses.subject;
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

      pair.decodePkcs8(passwordJson);

      return { value: true };
    } catch ({ message }) {
      const errorType = message === 'Unable to decode using the supplied passphrase' ? 'jsonPassword' : 'jsonInvalid';

      return { value: false, errorType };
    }
  }

  public static decodeAddress(address: string): Uint8Array {
    return decodeAddress(address, false);
  }

  public static evmToAddress(address: string, networkName: string) {
    const networks = NetworksController.getNetworks();
    const network = networks.find(({ name }) => name === networkName);
    const prefix = network?.addressPrefix;

    return evmToAddress(address, prefix);
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

    // the only case for try/catch
    // if the user used  ethereum account instead of a substratum account(via json or private key)
    try {
      const publicKey = this.decodeAddress(address);
      const networks = NetworksController.getNetworks();
      const network = networks.find(({ name }) => name === networkName);
      const prefix = network?.addressPrefix;

      return encodeAddress(publicKey, prefix);
    } catch {
      return ethereumAddress;
    }
  }

  public static unlockPair(from: string, password: string): boolean {
    const pair = keyring.getPair(from);

    try {
      pair.unlock(password);

      return true;
    } catch {
      return false;
    }
  }

  public static deleteAccount(address: string): void {
    keyring.forgetAccount(address);
  }

  public static deleteWallet(address: string): number {
    if (BaseApi.getAddressType(address) === 'account') {
      const { meta } = BaseApi.getPair(address);
      const { ethereumAddress } = getMetaTyped(meta);

      BaseApi.deleteAccount(address);

      if (ethereumAddress !== '') BaseApi.deleteAccount(ethereumAddress);

      // delete replaced accounts
      BaseApi.getReplacedAccounts({ address, ethereumAddress })
        .filter(({ meta }) => {
          const { replacedSettings } = getReplacedMetaTyped(meta);

          // if replaced account are used only for this main wallet
          return Object.keys(replacedSettings).length === 1;
        })
        .forEach(({ address }) => BaseApi.deleteAccount(address));
    }

    if (BaseApi.getAddress(address)) {
      keyring.forgetAddress(address);

      beaconController.resetConnection();
    }

    return [...BaseApi.getAddresses(), ...BaseApi.getAccounts()].length;
  }

  public static windowOpen(path: string): void {
    if (!isExtension()) return;

    const url = `${chrome.runtime.getURL('popup.html')}#${path}`;

    chrome.tabs.create({ url });
  }

  public static useIsPopup(): boolean {
    return window.innerWidth <= 560;
  }

  public static getFirstSubstrateWalletAddress(): string {
    const accounts = BaseApi.getAccounts().map(({ address }) => BaseApi.getPair(address));
    const addresses = BaseApi.getAddresses();

    if (accounts.length) {
      const address = accounts.find(({ type, meta }) => type !== 'ethereum' && !meta.isReplacedAccount)?.address;

      return address ?? '';
    }

    if (addresses.length) return addresses[0].address;

    return '';
  }

  public static getEquilibriumAssetName(symbol: string): number {
    return assetFromToken(symbol)[0];
  }
}
