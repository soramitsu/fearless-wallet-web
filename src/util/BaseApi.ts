import { decodeAddress, encodeAddress, hdValidatePath, isEthereumAddress } from '@polkadot/util-crypto';
import { isHex, bnToBn, formatNumber } from '@polkadot/util';
import type { KeyringPairs$Json } from '@subwallet/ui-keyring/types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { Wallet } from '@/stores';
import type { AccountJson } from '@extension-base/background/types/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import type { NetworkName } from '@/interfaces';
import { ETHEREUM_NETWORKS, NATIVE_ETHEREUM_NETWORKS, SUBSTRATE_ETHEREUM_NETWORKS } from '@/consts/networks';
import { IS_PRODUCTION } from '@/consts/global';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

type WalletTypes = 'mobile' | 'native';

export default class BaseApi {
  public static getWalletType(address: string): WalletTypes | null {
    const accountsStore = useAccountsStore();
    const substrateAddress = BaseApi.encodeAddress(address);
    const accounts = accountsStore.accounts as AccountJson[];
    const account = accounts.find((accountItem: AccountJson) => accountItem.address === substrateAddress);

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

  public static isHex(value: string): boolean {
    return isHex(value);
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

  public static isMobileWallet(address: string) {
    const accountsStore = useAccountsStore();
    const accounts = accountsStore.accounts as AccountJson[];

    return accounts.some((accountItem: AccountJson) => accountItem.address === address && accountItem.isMobile);
  }

  public static isSubstrateEthereumNetwork(network: string): boolean {
    if (!network) return false;

    return SUBSTRATE_ETHEREUM_NETWORKS.includes(network.toLowerCase());
  }

  public static isEthereumNetwork(network: string): boolean {
    if (!network) return false;

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
      const publicKey = decodeAddress(address, false);

      if (!isEthereumNetwork) BaseApi.encodeAddress(publicKey);

      return true;
    } catch (e) {
      if (!IS_PRODUCTION) console.info(e);

      return false;
    }
  }

  public static validateAddressByNetwork(address: string, network: string): boolean {
    if (BaseApi.isEthereumNetwork(network)) return BaseApi.isEthereumAddress(address);

    return address === BaseApi.formatAddress({ address, ethereumAddress: address }, network);
  }

  public static formatAddress({ address, ethereumAddress }: Wallet, networkName: NetworkName = 'westend'): string {
    const isEthereumNetwork = BaseApi.isEthereumNetwork(networkName);

    if (isEthereumNetwork) return ethereumAddress;

    const networksStore = useNetworksStore();
    const network = networksStore.getNetwork(networkName);
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
      // for ETH addresses
      return publicKey as string;
    }
  }
}
