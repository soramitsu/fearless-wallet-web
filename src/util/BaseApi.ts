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
import { assetFromToken } from '@equilab/api';
import type { KeyringAddress, KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { BehaviorSubject } from 'rxjs';
import type { KeyringPair$Json, KeyringPair$Meta, KeyringPair } from '@polkadot/keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { ValidateJsonResult, DerivationPath } from '@/interfaces';
import type { Wallet } from '@/store';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { createAccountSuri, forgetAccount, getAccountMeta, isJsonValid, jsonRestore } from '@/extension/messaging';
import { getReplacedMetaTyped, getMetaTyped } from '@/helpers/common';
import { ETHEREUM_NETWORKS, ETHEREUM_ADDRESS_LENGTH, ETHEREUM_ADDRESS_PREFIX } from '@/consts/networks';
import NetworksController from '@/controllers/networksController';
import { VALID_MNEMONIC } from '@/consts/derivationPath';
import { beaconController } from '@/controllers/beaconController';
import store from '@/store';
import { AccountJson } from '@/extension/background/extension-base/src/background/types';

type WordCount = 12 | 15 | 18 | 21 | 24;
type WalletTypes = 'mobile' | 'native';

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

  public static isMobileWallet(address: string): boolean {
    const substrateAddress = BaseApi.encodeAddress(address);

    return !!BaseApi.getAddress(substrateAddress)?.meta.isMobile;
  }

  public static getWalletType(address: string): WalletTypes | null {
    const substrateAddress = BaseApi.encodeAddress(address);
    if (BaseApi.getAccount(substrateAddress)) return 'native';
    if (BaseApi.getAddress(substrateAddress)?.meta.isMobile) return 'mobile';

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
      .filter(async (account) => {
        const { meta } = await getAccountMeta({ address: account.address });
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
    const isEthereumNetwork = BaseApi.isEthereumNetwork(network);
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
    console.info(wallet, network);

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

    createAccountSuri(password, suri, type, undefined, meta); // for proper work of extension

    return pair;
  }

  public static async addKeypairFromJson(json: KeyringPair$Json, password: string): Promise<string> {
    return jsonRestore(json, password); // for proper work of extension
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
  //TEMP FOR TESTING
  public static getAccounts(): { address: string }[] {
    return (store.getters.getAccounts as AccountJson[]).map(({ address }) => {
      return { address };
    });
  }

  public static getAddress(address: string): KeyringAddress | undefined {
    return keyring.getAddress(address, 'address');
  }

  public static getAddresses(): KeyringAddress[] {
    return keyring.getAddresses();
  }

  public static getMobileAddresses(): KeyringAddress[] {
    return BaseApi.getAddresses().filter(({ meta }) => meta.isMobile);
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
    // const index = accounts.findIndex(({ address, meta }) => address === addressProp && meta.isReplacedAccount === true);
    //TEMP
    const index = accounts.findIndex(({ address }) => address === addressProp);

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

  public static isValidJson(
    json: KeyringPair$Json,
    passwordJson: string,
    isSubstrate = true
  ): Promise<ValidateJsonResult> {
    return isJsonValid(json, passwordJson, isSubstrate);
  }

  public static decodeAddress(address: string): Uint8Array {
    return decodeAddress(address, false);
  }

  public static evmToAddress(address: string, networkName: string): string {
    const networks = NetworksController.getNetworks();
    const network = networks.find(({ name }) => name === networkName);
    const prefix = network?.addressPrefix;

    return evmToAddress(address, prefix);
  }

  public static validateEthereumAddress(address: string): boolean {
    if (!address.toLowerCase().startsWith(ETHEREUM_ADDRESS_PREFIX)) return false;

    if (address.length !== ETHEREUM_ADDRESS_LENGTH) return false;

    return true;
  }

  public static isSameAddress(wallet: Wallet, address: string, network: string): boolean {
    return BaseApi.formatAddress(wallet, network) === address;
  }

  public static validateAddress(address: string, network: string): boolean {
    const isEthereumNetwork = BaseApi.isEthereumNetwork(network);

    if (isEthereumNetwork && !BaseApi.validateEthereumAddress(address)) return false;

    try {
      const publicKey = BaseApi.decodeAddress(address);

      if (!isEthereumNetwork) BaseApi.encodeAddress(publicKey);

      return true;
    } catch {
      return false;
    }
  }

  public static validateAddressByNetwork(address: string, network: string): boolean {
    if (BaseApi.isEthereumNetwork(network)) {
      return BaseApi.validateEthereumAddress(address);
    }

    return address === BaseApi.formatAddress({ address, ethereumAddress: address }, network);
  }

  public static formatAddress({ address, ethereumAddress }: Wallet, networkName: string): string {
    const isEthereumNetwork = BaseApi.isEthereumNetwork(networkName);

    if (isEthereumNetwork) return ethereumAddress;

    const networks = NetworksController.getNetworks();
    const network = networks.find(({ name }) => name === networkName);
    const prefix = network?.addressPrefix;

    // the only case for try/catch
    // if the user used  ethereum account instead of a substratum account(via json or private key)
    try {
      return BaseApi.encodeAddress(address, prefix);
    } catch {
      return ethereumAddress;
    }
  }

  public static encodeAddress(publicKey: string | Uint8Array, prefix = 42) {
    return encodeAddress(publicKey, prefix);
  }

  public static unlockPair(address: string, password: string): boolean {
    const pair = keyring.getPair(address);

    try {
      pair.unlock(password);

      return true;
    } catch {
      return false;
    }
  }

  public static lockPair(address: string): void {
    const pair = keyring.getPair(address);

    pair.lock();
  }

  public static isSameWalletPassword(address: string, password: string): boolean {
    const isUnlock = BaseApi.unlockPair(address, password);

    BaseApi.lockPair(address);

    return isUnlock;
  }

  public static deleteAccount(address: string): void {
    keyring.forgetAccount(address);
  }

  static deleteNativeWallet(address: string) {
    //DELETE WALLET IN FRONTEND KEYRING ONLY
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

    forgetAccount(address, 'native');

    return [...BaseApi.getAddresses(), ...BaseApi.getAccounts()].length;
  }

  static async deleteMobileWallet(address: string): Promise<number> {
    BaseApi.forgetAddress(address);

    beaconController.resetConnection();

    forgetAccount(address, 'mobile');

    return [...BaseApi.getAddresses(), ...BaseApi.getAccounts()].length;
  }

  public static isExtension(): boolean {
    return chrome.extension !== undefined;
  }

  public static windowOpen(path: string): void {
    if (!BaseApi.isExtension()) return;

    const url = `${chrome.runtime.getURL('popup.html')}#${path}`;

    chrome.tabs.create({ url });
  }

  public static useIsPopup(): boolean {
    return window.innerWidth <= 561 && BaseApi.isExtension();
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

  public static getEquilibriumAssetId(symbol: string): number {
    return assetFromToken(symbol)[0];
  }

  static updateWalletName(address: string, name: string): void {
    if (BaseApi.isMobileWallet(address)) {
      const substrateAddress = BaseApi.encodeAddress(address);
      const { meta } = BaseApi.getAddress(substrateAddress)!;

      meta.name = name;

      BaseApi.saveAddress(substrateAddress, meta);

      return;
    }

    const pair = BaseApi.getKeyringPair(address);
    const meta = getMetaTyped(pair.meta);

    meta.name = name;

    keyring.saveAccountMeta(pair, meta as any);
  }

  static saveEthereumAddress(substrateAddress: string, ethereumAddress: string): void {
    const pair = BaseApi.getKeyringPair(substrateAddress);
    const meta = getMetaTyped(pair.meta);

    meta.ethereumAddress = ethereumAddress;

    keyring.saveAccountMeta(pair, meta as any);
  }
}
