import type { INITIAL_DERIVATION_PATH } from '@/consts/derivationPath';

export type TMutation<T> = (props: T) => void;

export interface Meta {
  name: string;
  ethereumAddress: string;
}

export type TabWallet = 'Currencies' | 'NFTs';
export type WalletConnectionStatus = 'isCreateWallet' | 'isImportWallet' | '';
export type TypeFiledForImport = 'rawSeed' | 'json' | 'mnemonic';
export type FilterHistory = 'all' | 'transfer' | 'reward' | 'extrinsic';

export type WalletAddress = string;
export type NetworkName = string;

export type DerivationPath = typeof INITIAL_DERIVATION_PATH;
