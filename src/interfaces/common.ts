import type { WarningValueName } from '@/consts/messages';
import type { AssetName } from './assets';
import { type INITIAL_DERIVATION_PATHS } from '@/consts/derivationPath';
import { type Components } from '@/router/routes';

type Fn<T = null, R = void> = (props?: T) => R;
type AsyncFn<T = null, R = void> = (props?: T) => Promise<R>;
type TCallback<T> = (payload: T) => void;

interface CustomEvent extends Event {
  target: HTMLDivElement;
}

interface Meta {
  name: string;
  ethereumAddress: string;
  isMobile: boolean;
}

interface AddressMeta extends Meta {
  isMobile: boolean;
}

type ParentAddress = string;

type TabWallet = Components.Currencies | Components.Nfts;
type StakingTab = 'all' | 'my';
type MyStakingTab = 'about' | 'alerts' | 'history';
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
}

type MenuItem = keyof typeof MenuItems;

type FiatJson = {
  id: string;
  symbol: string;
  name: string;
  icon: string;
};

type ChainAccount = {
  network: string;
  networkIcon: string;
  address: string;
};

type TextLocaleProps = Record<string, string> & {
  tc?: number;
};

type ComponentText =
  | string
  | {
      text: string;
      localeProps?: TextLocaleProps;
    };

interface ChangeWalletBalance {
  percent: number;
  amount: number;
}

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

type ToggleFnProp = (type: string, data: object, flag?: boolean) => void;

export {
  DerivationPath,
  DerivationPaths,
  FiatJson,
  Placement,
  FilterHistory,
  ImportType,
  MenuItem,
  ToggleFnProp,
  MenuItems,
  ParentAddress,
  Fn,
  AsyncFn,
  TabWallet,
  ValidateJsonResult,
  WalletAddress,
  Meta,
  MnemonicConfirmation,
  ChainAccount,
  AssetName,
  ComponentText,
  AddressMeta,
  CustomEvent,
  TCallback,
  ChangeWalletBalance,
  StakingTab,
  MyStakingTab,
};
