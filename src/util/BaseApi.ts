import { decodeAddress, encodeAddress, hdValidatePath, isEthereumAddress } from '@polkadot/util-crypto';
import { isHex, bnToBn, formatNumber } from '@polkadot/util';
import type { KeyringPairs$Json } from '@subwallet/ui-keyring/types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { Wallet } from '@/stores';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import { WalletEcosystem, type NetworkName } from '@/interfaces';
import { ETHEREUM_NETWORKS, NATIVE_ETHEREUM_NETWORKS, SUBSTRATE_ETHEREUM_NETWORKS } from '@/consts/networks';
import { IS_PRODUCTION } from '@/consts/global';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { isBitcoinAddress, type BitcoinNetworkKind } from '@/util/bitcoin';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { encodeIrohaI105Address, isIrohaI105Address, type IrohaNetworkInput } from '@/util/iroha';

type WalletTypes = 'mobile' | 'native';

const BASE58_PUBLIC_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default class BaseApi {
  public static getWalletType(address: string): WalletTypes | null {
    const accountsStore = useAccountsStore();
    const substrateAddress = BaseApi.encodeAddress(address);
    const accounts = accountsStore.accounts;
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
    const accounts = accountsStore.accounts;

    return accounts.some((account) => account.address === address && account.isMobile);
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

  public static isSolanaNetwork(network: string): boolean {
    if (!network) return false;

    try {
      return useNetworksStore().getNetwork(network)?.ecosystem === WalletEcosystem.Solana;
    } catch {
      return network.toLowerCase().includes('solana');
    }
  }

  public static isBitcoinNetwork(network: string): boolean {
    if (!network) return false;

    try {
      return useNetworksStore().getNetwork(network)?.ecosystem === WalletEcosystem.Bitcoin;
    } catch {
      return network.toLowerCase().includes('bitcoin');
    }
  }

  public static isIrohaNetwork(network: string): boolean {
    if (!network) return false;

    try {
      return useNetworksStore().getNetwork(network)?.ecosystem === WalletEcosystem.Iroha;
    } catch {
      const normalized = network.toLowerCase();

      return normalized.includes('iroha') || normalized.includes('taira') || normalized.includes('nexus');
    }
  }

  private static getBitcoinExpectedNetwork(network: string): BitcoinNetworkKind {
    try {
      const networkJson = useNetworksStore().getNetwork(network);
      const contract = `${networkJson?.chainId ?? ''} ${networkJson?.name ?? ''} ${network}`.toLowerCase();

      return contract.includes('testnet') ? 'testnet' : 'mainnet';
    } catch {
      return network.toLowerCase().includes('testnet') ? 'testnet' : 'mainnet';
    }
  }

  private static formatBitcoinAddress(
    { address, bitcoinAddress, bitcoinTestnetAddress }: Wallet,
    networkName: string
  ): string {
    if (BaseApi.getBitcoinExpectedNetwork(networkName) === 'testnet') return bitcoinTestnetAddress ?? address;

    return bitcoinAddress ?? address;
  }

  private static getIrohaExpectedNetwork(network: string): IrohaNetworkInput {
    try {
      const networkJson = useNetworksStore().getNetwork(network);
      const contract = `${networkJson?.chainId ?? ''} ${networkJson?.name ?? ''} ${network}`.toLowerCase();
      const discriminant =
        (networkJson as { chainDiscriminant?: unknown; i105Prefix?: unknown } | undefined)?.chainDiscriminant ??
        (networkJson as { i105Prefix?: unknown } | undefined)?.i105Prefix;

      if (discriminant === UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainDiscriminant) return 'taira';
      if (discriminant === UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainDiscriminant) return 'nexus';
      if (typeof discriminant === 'number') return discriminant;
      if (networkJson?.chainId === UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId || contract.includes('taira')) {
        return 'taira';
      }
      if (networkJson?.chainId === UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId || contract.includes('nexus')) {
        return 'nexus';
      }
    } catch {
      // Fallback below keeps tests and legacy static calls deterministic.
    }

    const normalized = network.toLowerCase();

    return normalized.includes('taira') || normalized.includes('testnet') ? 'taira' : 'nexus';
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

  public static isSolanaAddress(address: string): boolean {
    return BASE58_PUBLIC_KEY.test(address);
  }

  public static isBitcoinAddress(address: string, network?: BitcoinNetworkKind): boolean {
    return isBitcoinAddress(address, network);
  }

  public static isSameAddress(wallet: Wallet, address: string, network: string): boolean {
    return BaseApi.formatAddress(wallet, network) === address;
  }

  public static validateAddress(address: string, network: string): boolean {
    const isEthereumNetwork = BaseApi.isEthereumNetwork(network);
    const isSolanaNetwork = BaseApi.isSolanaNetwork(network);
    const isBitcoinNetwork = BaseApi.isBitcoinNetwork(network);
    const isIrohaNetwork = BaseApi.isIrohaNetwork(network);

    if (isSolanaNetwork) return BaseApi.isSolanaAddress(address);
    if (isBitcoinNetwork) return BaseApi.isBitcoinAddress(address, BaseApi.getBitcoinExpectedNetwork(network));
    if (isIrohaNetwork) return isIrohaI105Address(address, BaseApi.getIrohaExpectedNetwork(network));

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
    if (BaseApi.isSolanaNetwork(network)) return BaseApi.isSolanaAddress(address);
    if (BaseApi.isBitcoinNetwork(network))
      return BaseApi.isBitcoinAddress(address, BaseApi.getBitcoinExpectedNetwork(network));
    if (BaseApi.isIrohaNetwork(network)) return isIrohaI105Address(address, BaseApi.getIrohaExpectedNetwork(network));

    if (BaseApi.isEthereumNetwork(network)) return BaseApi.isEthereumAddress(address);

    return address === BaseApi.formatAddress({ address, ethereumAddress: address }, network);
  }

  public static formatAddress(
    {
      address,
      ethereumAddress,
      bitcoinAddress,
      bitcoinTestnetAddress,
      solanaAddress,
      irohaAddress,
      irohaPublicKeyHex,
    }: Wallet,
    networkName: NetworkName = 'westend'
  ): string {
    if (BaseApi.isSolanaNetwork(networkName)) return solanaAddress ?? address;
    if (BaseApi.isBitcoinNetwork(networkName))
      return BaseApi.formatBitcoinAddress({ address, ethereumAddress, bitcoinAddress, bitcoinTestnetAddress }, networkName);
    if (BaseApi.isIrohaNetwork(networkName)) {
      if (irohaPublicKeyHex) {
        try {
          return encodeIrohaI105Address(irohaPublicKeyHex, BaseApi.getIrohaExpectedNetwork(networkName));
        } catch {
          return irohaAddress ?? address;
        }
      }

      return irohaAddress ?? address;
    }

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
