import type { KeypairType } from '@polkadot/util-crypto/types';

export type TMutation<T> = (props: T) => void;

export interface Meta {
  name: string;
  ethereumAddress: string;
}

export type TabWallet = 'Currencies' | 'NFTs';
export type WalletConnectionStatus = 'isCreateWallet' | 'isImportWallet' | '';
export type TypeFiledForImport = 'rawSeed' | 'json' | 'mnemonic';

export interface Substrate$Ethereum {
  value: string;
  keyPair: KeypairType;
}

export interface DerivationPath {
  substrate: Substrate$Ethereum;
  ethereum: Substrate$Ethereum;
}
