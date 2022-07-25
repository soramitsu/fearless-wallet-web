import type { InvalidValueName } from '@/consts/invalidMessages';
import type { INITIAL_DERIVATION_PATH } from '@/consts/derivationPath';

export type TMutation<T> = (props: T) => void;

export interface Meta {
  name: string;
  ethereumAddress: string;
}

export interface ReplacementMeta {
  isReplacementAccount: true;
  replacementSettings: [
    {
      parentAddress: string;
      networksList: string[];
    }
  ];
}

export type TabWallet = 'Currencies' | 'NFTs';
export type ImportType = 'mnemonic' | 'rawSeed' | 'json';
export type FilterHistory = 'all' | 'transfer' | 'reward' | 'extrinsic';

export type WalletAddress = string;
export type NetworkName = string;

export type DerivationPath = typeof INITIAL_DERIVATION_PATH;

interface ValidateJsonResult1 {
  value: true;
}

interface ValidateJsonResult2 {
  value: false;
  errorType: InvalidValueName;
}

export type ValidateJsonResult = ValidateJsonResult1 | ValidateJsonResult2;
