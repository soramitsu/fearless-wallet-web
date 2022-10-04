import type { InvalidValueName } from '@/consts/invalidMessages';
import { INITIAL_DERIVATION_PATHS } from '@/consts/derivationPath';

type TMutation<T> = (props?: T) => void;
type TAction<T> = (props?: T) => Promise<void>;

interface Meta {
  name: string;
  ethereumAddress: string;
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
type AssetName = string;

type DerivationPath = typeof INITIAL_DERIVATION_PATHS.substrate;
type DerivationPaths = typeof INITIAL_DERIVATION_PATHS;

interface ValidateJsonResultPositive {
  value: true;
}

interface ValidateJsonResultNegative {
  value: false;
  errorType: InvalidValueName;
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
  dex = 'DEX',
  history = 'History',
}

type MenuItem = 'Wallet' | 'Crowdloans' | 'Staking' | 'DEX' | 'History';

type FiatJson = {
  id: string;
  symbol: string;
  name: string;
  icon: string;
};

type ChainAccount = {
  network: string;
  token: string;
  address: string;
  isReplaced: boolean;
};

export {
  DerivationPath,
  DerivationPaths,
  FiatJson,
  FilterHistory,
  ImportType,
  InvalidValueName,
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
};
