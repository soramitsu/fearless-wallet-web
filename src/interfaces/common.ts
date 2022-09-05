import type { InvalidValueName } from '@/consts/invalidMessages';
import type { INITIAL_DERIVATION_PATH } from '@/consts/derivationPath';

export type TMutation<T> = (props: T) => void;

export interface Meta {
  name: string;
  ethereumAddress: string;
}

type ParentAddress = string;

export interface ReplacedMeta {
  isReplacedAccount: true;
  replacedSettings: Record<ParentAddress, string[]>;
}

export type TabWallet = 'Currencies' | 'NFTs';
export type ImportType = 'mnemonic' | 'rawSeed' | 'json';
export type FilterHistory = 'all' | 'transfer' | 'reward' | 'extrinsic';

export type WalletAddress = string;
export type NetworkName = string;

export type DerivationPath = typeof INITIAL_DERIVATION_PATH;

interface ValidateJsonResultPositive {
  value: true;
}

interface ValidateJsonResultNegative {
  value: false;
  errorType: InvalidValueName;
}

export type ValidateJsonResult = ValidateJsonResultPositive | ValidateJsonResultNegative;

export interface MnemonicConfirmation {
  word: string;
  initialIndex: number;
}
