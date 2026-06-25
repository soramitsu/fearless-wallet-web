import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import type { WalletAddress, NetworkName, WalletEcosystem } from '@/interfaces';
import { type AccountJson } from '@/extension/background/extension-base/src/background/types/types';

export interface Wallet {
  address: string;
  ethereumAddress: string;
  bitcoinAddress?: string;
  bitcoinTestnetAddress?: string;
  solanaAddress?: string;
  irohaAddress?: string;
  irohaPublicKeyHex?: string;
  walletEcosystem?: WalletEcosystem;
  isMobile?: boolean;
  isMasterAccount?: boolean;
  isMasterPassword?: boolean;
  haveEntropy?: boolean;
}

export interface SelectedWallet extends Wallet {
  name: string;
  isSubstrate: boolean;
  isTon: boolean;
  hasEthereum: boolean;
}

export type HiddenAssets = {
  [x: WalletAddress]: string[];
};

export type SetHiddenAsset = {
  groupId: string;
  value: boolean;
};

export type SetAccountsProps = {
  accounts: AccountJson[];
};

export type SetAutoSelectNode = {
  network: string;
  value: boolean;
};

export type SelectedNetworks = Record<WalletAddress, string>;
export type FavoriteNetworks = Record<WalletAddress, string[]>;

export type Accounts = SubjectInfo;
export type AutoSelectNode = Record<NetworkName, boolean>;
export type GetAutoSelectNodesValueByNetwork = (networkName: string) => boolean;
export type GetFavoriteNetworkStatus = (networkName: string) => boolean;
export type GetShowWarningNetworks = (assetId: string) => boolean;
export type GetAccountMeta = (assetId: string) => Record<string, unknown>;

export interface WalletInfo {
  name: string;
  address: string;
  ethereumAddress: string;
  bitcoinAddress?: string;
  bitcoinTestnetAddress?: string;
  solanaAddress?: string;
  irohaAddress?: string;
  irohaPublicKeyHex?: string;
  isMobile: boolean;
  active: boolean;
}

export interface IWallet {
  type: string;
  json: {
    address: string;
    meta: {
      name: string;
    };
  };
}
