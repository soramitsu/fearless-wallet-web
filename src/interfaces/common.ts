import type { WarningValueName } from '@/consts/messages';
import type { AssetName } from './assets';
import { INITIAL_DERIVATION_PATHS } from '@/consts/derivationPath';

type TMutation<T> = (props?: T) => void;
type TAction<T> = (props?: T) => Promise<void>;

interface Meta {
  name: string;
  ethereumAddress: string;
  isMobile: boolean;
}

type ParentAddress = string;

interface ReplacedMeta {
  isReplacedAccount: true;
  replacedSettings: Record<ParentAddress, string[]>;
}

type TabWallet = 'Currencies' | 'NFTs';
type ImportType = 'mnemonic' | 'rawSeed' | 'json';
type FilterHistory = 'all' | 'transfer' | 'reward' | 'extrinsic';

type WalletAddress = string;

type DerivationPath = typeof INITIAL_DERIVATION_PATHS.substrate;
type DerivationPaths = typeof INITIAL_DERIVATION_PATHS;

interface ValidateJsonResultPositive {
  value: true;
}

interface ValidateJsonResultNegative {
  value: false;
  errorType: WarningValueName;
}

type ValidateJsonResult = ValidateJsonResultPositive | ValidateJsonResultNegative;

interface MnemonicConfirmation {
  word: string;
  initialIndex: number;
}

enum MenuItems {
  wallet = 'Wallet',
  crowdloans = 'Crowdloans',
  staking = 'Staking',
  polkaswap = 'Polkaswap',
  history = 'History',
}

type MenuItem = 'Wallet' | 'Crowdloans' | 'Staking' | 'Polkaswap' | 'History';

type FiatJson = {
  id: string;
  symbol: string;
  name: string;
  icon: string;
};

type ChainAccount = {
  network: string;
  asset: string;
  address: string;
  isReplaced: boolean;
};

type TextLocaleProps = Record<string, string> & {
  tc?: number;
};

type ComponentText =
  | string
  | {
      text: string;
      localeProps: TextLocaleProps;
    };

type Placement =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-start'
  | 'right-start'
  | 'bottom-start'
  | 'left-start'
  | 'top-end'
  | 'right-end'
  | 'bottom-end'
  | 'left-end';

export {
  DerivationPath,
  DerivationPaths,
  FiatJson,
  Placement,
  FilterHistory,
  ImportType,
  MenuItem,
  MenuItems,
  ParentAddress,
  TAction,
  TMutation,
  TabWallet,
  ValidateJsonResult,
  WalletAddress,
  ReplacedMeta,
  Meta,
  MnemonicConfirmation,
  ChainAccount,
  AssetName,
  ComponentText,
};
