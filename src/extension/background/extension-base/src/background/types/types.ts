/* eslint-disable no-use-before-define */
import { Subscription } from 'rxjs';
import { ALLOWED_PATH } from '@extension-base/defaults';

import { JsonRpcProvider } from 'ethers';
import { ApiPromise } from '@polkadot/api';
import { WsProvider } from '@polkadot/rpc-provider';
import { ProviderInterface } from '@polkadot/rpc-provider/types';
import { HexString } from '@polkadot/util/types';
import { UserType } from '../../services/onboarding-service/types';
import MetadataStore from '../../stores/Metadata';
import type { KeyringPair$Json, KeyringPair, KeyringPair$Meta } from '@polkadot/keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { NetworkJson } from '@extension-base/types';
import type { RequestSignatures } from '@extension-base/background/types/messages';
import type { TypeRegistry } from '@polkadot/types';
import type { SignerResult } from '@polkadot/types/types/extrinsic';
import type { Registry, SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { MetadataDef, ProviderList, ProviderMeta } from '@polkadot/extension-inject/types';
import type { AccountAuthType, AddressBook, AuthUrlInfo } from '@extension-base/background/types';
import {
  NetworkName,
  WalletAddress,
  AssetName,
  ChangeWalletBalance,
  RelayChainName,
  BuyProvider,
  MarketType,
  SwapOptions,
} from '@/interfaces';

type KeysWithDefinedValues<T> = {
  [K in keyof T]: T[K] extends undefined ? never : K;
}[keyof T];

type NoUndefinedValues<T> = {
  [K in KeysWithDefinedValues<T>]: T[K];
};

type IsNull<T, K extends keyof T> = { [K1 in Exclude<keyof T, K>]: T[K1] } & T[K] extends null ? K : never;

type NullKeys<T> = { [K in keyof T]: IsNull<T, K> }[keyof T];

export type Port = chrome.runtime.Port;

export interface AccountJson extends KeyringPair$Meta {
  address: string;
  ethereumAddress: string;
  genesisHash?: HexString | null;
  network?: string;
  isExternal?: boolean;
  isHardware?: boolean;
  isMobile?: boolean;
  isHidden?: boolean;
  active?: boolean;
  name: string;
  parentAddress?: string;
  suri?: string;
  type?: KeypairType;
  whenCreated?: number;
}

export interface ApproveAuthRequest {
  request: AuthorizeRequest;
  accounts: string[];
}

export interface AuthorizeRequest {
  id: string;
  request: RequestAuthorizeTab;
  url: string;
}

export interface MetadataRequest {
  id: string;
  request: MetadataDef;
  url: string;
}

export interface SigningRequest {
  account: AccountJson;
  id: string;
  request: RequestSign;
  url: string;
}

export interface RequestAddressCreate {
  address: string;
  meta: KeyringPair$Meta;
}

export interface SubscribeBalanceRequest {
  id: string;
  port: Port;
}

export type ConnectedTabsUrlResponse = string[];

export type NetWorkGroup =
  | 'RELAY_CHAIN'
  | 'POLKADOT_PARACHAIN'
  | 'KUSAMA_PARACHAIN'
  | 'MAIN_NET'
  | 'TEST_NET'
  | 'UNKNOWN';

export interface DisableNetworkResponse {
  success: boolean;
  activeNetworkCount?: number;
}

export type RequestSubscribePrice = null;
export interface RequestCurrentAccountAddress {
  address: string;
}
export type MessageTypes = keyof RequestSignatures;

// Requests

export type RequestTypes = {
  [MessageType in keyof RequestSignatures]: RequestSignatures[MessageType][0];
};

export type MessageTypesWithNullRequest = NullKeys<RequestTypes>;

export interface TransportRequestMessage<TMessageType extends MessageTypes> {
  id: string;
  message: TMessageType;
  origin: string;
  request: RequestTypes[TMessageType];
}

export interface RequestAuthorizeTab {
  origin: string;
  accountAuthType?: AccountAuthType;
  allowedAccounts?: string[];
  reConfirm?: boolean;
}

export interface RequestAuthorizeApprove {
  id: string;
  authorizedAccounts: string[];
}

export interface RequestUpdateAuthorizedAccounts {
  url: string;
  authorizedAccounts: string[];
}

export interface RequestMetadataApprove {
  id: string;
}

export interface RequestMetadataReject {
  id: string;
}

export interface RequestAccountCreateSuri {
  password: string;
  suri: string;
  type?: KeypairType;
  meta: KeyringPair$Meta;
}

export interface BalanceJson {
  reset?: boolean;
  details: TokenBalance[];
  saveSequence?: boolean;
}

export enum TransferErrorCode {
  NOT_ENOUGH_FEE = 'notEnoughValue',
  INVALID_VALUE = 'invalidValue',
  INVALID_TOKEN = 'invalidToken',
  TRANSFER_ERROR = 'transferError',
  UNSUPPORTED = 'unsupported',
}

export enum BasicTxErrorCode {
  INVALID_PARAM = 'invalidParam',
  KEYRING_ERROR = 'keyringError',
  STAKING_ERROR = 'stakingError',
  UN_STAKING_ERROR = 'unStakingError',
  WITHDRAW_STAKING_ERROR = 'withdrawStakingError',
  CLAIM_REWARD_ERROR = 'claimRewardError',
  CREATE_COMPOUND_ERROR = 'createCompoundError',
  CANCEL_COMPOUND_ERROR = 'cancelCompoundError',
  TIMEOUT = 'timeout',
  BALANCE_TO_LOW = 'balanceTooLow',
  UNKNOWN_ERROR = 'unknownError',
}

export interface ExternalState {
  externalId: string;
}

export interface BasicTxResponse {
  passwordError?: string | null;
  callHash?: string;
  status?: boolean;
  extrinsicHash?: string;
  txError?: boolean;
  errors?: BasicTxError[];
  externalState?: ExternalState;
  isBusy?: boolean;
  txResult?: TxResultType;
  isFinalized?: boolean;
}

export type TxResultType = {
  change: string;
  changeSymbol?: string;
  fee?: string;
  feeSymbol?: string;
};

export enum BasicTxWarningCode {
  NOT_ENOUGH_EXISTENTIAL_DEPOSIT = 'notEnoughExistentialDeposit',
}

export type TxErrorCode = TransferErrorCode | BasicTxErrorCode;

export type TxWarningCode = BasicTxWarningCode;

export type BasicTxError = {
  code: TxErrorCode | TxWarningCode;
  data?: object;
  message: string;
};

export interface ApiState {
  isApiReady: boolean;
  isEthereum?: boolean;
  registry: Registry;
}

export interface ApiProps extends ApiState {
  api?: ApiPromise;
  provider?: WsProvider;
  isApiConnected: boolean;
  isEthereum: boolean;
  isEthereumOnly: boolean;
  isReady: Promise<ApiProps>;
  apiRetry: number;
  nodeIndex: number;
}

export type BasicTxWarning = {
  code: TxWarningCode;
  data?: object;
  message: string;
};

// eslint-disable-next-line @typescript-eslint/ban-types
export type BaseRequestSign = {};

export interface RequestCheckTransfer extends BaseRequestSign {
  networkKey: NetworkName;
  from: string;
  to: string;
  assetId: string;
  relayChain?: RelayChainName;
  amount?: string;
  password?: string;
  isMobile?: boolean;
}

export interface RequestCheckCrossChain extends BaseRequestSign {
  originNet: NetworkName;
  destinationNet: NetworkName;
  from: string;
  to: string;
  assetId: string;
  relayChain?: RelayChainName;
  amount?: string;
  password?: string;
  isMobile?: boolean;
}

export interface ResponseCheckTransfer {
  errors?: Array<BasicTxError>;
  warnings?: Array<BasicTxWarning>;
  fromAccountFree: string;
  estimateFee?: string;
  destEstimateFee: undefined;
}

export interface ResponseCheckCrossChain {
  errors?: Array<BasicTxError>;
  warnings?: Array<BasicTxWarning>;
  estimateFee?: string;
  destEstimateFee?: string;
}

export interface RequestCheckSwap extends BaseRequestSign {
  network: string;
  amountA: string;
  amountB: string;
  assetAId: string;
  assetBId: string;
  slippage: number;
  symbolA: string;
  symbolB: string;
  isExchangeB: boolean;
  marketType: MarketType;
}

export interface ResponseCheckSwap {
  errors?: Array<BasicTxError>;
  warnings?: Array<BasicTxWarning>;
  swapOptions?: SwapOptions;
  amountA: string;
  amountB: string;
  AToB: string;
  BToA: string;
  fee: string;
  networkFee?: string;
  minMaxValue: string;
  route: string;
}

export interface ResponseMakeSwap {
  errors?: Array<BasicTxError>;
  warnings?: Array<BasicTxWarning>;
  status: boolean;
}

export type PasswordRequestSign<T extends BaseRequestSign> = T & { password: string; isSavePass?: boolean };

export type ExternalRequestSign<T extends BaseRequestSign> = Omit<T, 'password'>;
export interface RequestSwap extends PasswordRequestSign<RequestCheckSwap> {
  feeSymbol?: string;
}
export interface BasicSwapResponse {
  feeSymbol?: string;
}

export type RequestTransfer = PasswordRequestSign<RequestCheckTransfer>;

export type RequestCrossChain = PasswordRequestSign<RequestCheckCrossChain>;

export interface RequestAccountExportPrivateKey {
  address: string;
  password?: string;
}

export interface ExternalRequestPromise {
  resolve?: (result: SignerResult | PromiseLike<SignerResult>) => void;
  reject?: (error?: Error) => void;
  status: ExternalRequestPromiseStatus;
  message?: string;
  createdAt: number;
}

export enum ExternalRequestPromiseStatus {
  PENDING,
  REJECTED,
  FAILED,
  COMPLETED,
}

export interface ResponseAccountExportPrivateKey {
  privateKey: string;
  publicKey: string;
}

export interface RequestAccountForget {
  address: string;
  type: 'native' | 'mobile';
}

export interface RequestUpdateMeta {
  address: string;
  meta: KeyringPair$Meta;
}

export interface RequestAccountName {
  address: string;
  name: string;
}

export interface RequestAccountValidate {
  address: string;
  password: string;
}

export interface RequestAccountExport {
  address: string;
  password: string;
}

export interface ApiMap {
  substrate: Record<string, ApiProps>;
  evm: Record<string, JsonRpcProvider>;
}

export interface RequestAccountList {
  anyType?: boolean;
}

export interface RequestActiveTabsUrlUpdate {
  tabs: chrome.tabs.Tab[];
}

export interface RequestAccountUnsubscribe {
  id: string;
}

export interface RequestRpcSend {
  method: string;
  params: unknown[];
}

export interface RequestRpcSubscribe extends RequestRpcSend {
  type: string;
}

export interface RequestRpcUnsubscribe {
  method: string;
  subscriptionId: number | string;
  type: string;
}

export interface RequestSigningApprovePassword {
  id: string;
  password?: string;
  savePass: boolean;
}

export interface RequestSigningApproveSignature {
  id: string;
  signature: HexString;
}

export interface RequestSigningCancel {
  id: string;
}

export interface RequestSigningIsLocked {
  id: string;
}

export interface ResponseSigningIsLocked {
  isLocked: boolean;
  remainingTime: number;
}

// Responses

export type ResponseTypes = {
  [MessageType in keyof RequestSignatures]: RequestSignatures[MessageType][1];
};

export type ResponseType<TMessageType extends keyof RequestSignatures> = RequestSignatures[TMessageType][1];

interface TransportResponseMessageSub<TMessageType extends MessageTypesWithSubscriptions> {
  error?: string;
  id: string;
  response?: ResponseTypes[TMessageType];
  subscription?: SubscriptionMessageTypes[TMessageType];
}

interface TransportResponseMessageNoSub<TMessageType extends MessageTypesWithNoSubscriptions> {
  error?: string;
  id: string;
  response?: ResponseTypes[TMessageType];
}

export type TransportResponseMessage<TMessageType extends MessageTypes> =
  TMessageType extends MessageTypesWithNoSubscriptions
    ? TransportResponseMessageNoSub<TMessageType>
    : TMessageType extends MessageTypesWithSubscriptions
    ? TransportResponseMessageSub<TMessageType>
    : never;

export interface ResponseSigning {
  id: string;
  signature: HexString;
}

export interface ResponseAccountExport {
  exportedJson: KeyringPair$Json;
}

export type ResponseRpcListProviders = ProviderList;

// Subscriptions

export type SubscriptionMessageTypes = NoUndefinedValues<{
  [MessageType in keyof RequestSignatures]: RequestSignatures[MessageType][2];
}>;

export type MessageTypesWithSubscriptions = keyof SubscriptionMessageTypes;
export type MessageTypesWithNoSubscriptions = Exclude<MessageTypes, keyof SubscriptionMessageTypes>;

export interface RequestSign {
  readonly payload: SignerPayloadJSON | SignerPayloadRaw;

  sign(registry: TypeRegistry, pair: KeyringPair): { signature: HexString };
}

export interface RequestJsonRestore {
  file: KeyringPair$Json;
  password: string;
}

export interface RequestJsonValidate {
  file: KeyringPair$Json;
  password: string;
  isSubstrate?: boolean;
}

type TAllowPath = typeof ALLOWED_PATH;

export type AllowedPath = TAllowPath[number];

export interface ResponseAuthorizeList {
  list: AuthUrls;
}

export interface Resolver<T> {
  reject: (error: Error) => void;
  resolve: (result: T) => void;
}

export interface AuthRequest extends Resolver<AuthResponse> {
  id: string;
  idStr: string;
  request: RequestAuthorizeTab;
  url: string;
  accountAuthType?: AccountAuthType;
}

export type AuthUrls = Record<string, AuthUrlInfo>;

export type AuthorizedAccountsDiff = [url: string, authorizedAccounts: AuthUrlInfo['authorizedAccounts']][];

export interface MetaRequest extends Resolver<boolean> {
  id: string;
  request: MetadataDef;
  url: string;
}

export interface AuthResponse {
  result: boolean;
  authorizedAccounts: string[];
}
export type ActiveTabAuthorizeStatus = {
  isAuthorize: boolean;
  authorizeAccountsCount: number;
  dAppName: string;
};

// List of providers passed into constructor. This is the list of providers
// exposed by the extension.
export type Providers = Record<
  string,
  {
    meta: ProviderMeta;
    // The provider is not running at init, calling this will instantiate the
    // provider.
    start: () => ProviderInterface;
  }
>;

export interface SignRequest extends Resolver<ResponseSigning> {
  account: AccountJson;
  id: string;
  request: RequestSign;
  url: string;
}

export const NOTIFICATION_URL = chrome.runtime.getURL('popup.html');

export const POPUP_WINDOW_OPTS: chrome.windows.CreateData = {
  focused: true,
  height: 640,
  width: 577,
  type: 'popup',
  url: NOTIFICATION_URL,
};

export const NORMAL_WINDOW_OPTS: chrome.windows.CreateData = {
  focused: true,
  type: 'normal',
  url: NOTIFICATION_URL,
};

export enum NotificationOptions {
  None,
  Normal,
  PopUp,
}

export type CachedUnlocks = Record<string, number>;
export interface AccountSub {
  subscription: Subscription;
  url: string;
}
export type Subscriptions = Record<string, Port>;

export interface IState {
  registry: TypeRegistry;
  metaStore: MetadataStore;
  authUrls: AuthUrls;
  addresses: Record<string, string>;
  selectedNetworks: Record<string, string>;
  defaultAuthAccountSelection: string[];
  injectedProviders: Map<Port, ProviderInterface>;
  notification: string;
  subscriptions: Subscriptions;
  providers: Providers;
  accountSubs: Record<string, AccountSub>;
  windows: number[];
  fiatSymbol: string;
  cachedUnlocks: CachedUnlocks;
  balances: Record<WalletAddress, Record<AssetName, Record<NetworkName, BalanceItem>>>;
  connectedTabsUrl: string[];
  transaction: Record<string, TransactionHistoryItem[]>;
  addressBook: AddressBook;
  userType: UserType;
  onboarding: {
    user: UserType;
    isRequired: boolean;
    seen: boolean;
  };
  'wc@2:client:0.3//session': Array<unknown>;
  'wc@2:core:0.3//pairing': Array<unknown>;
  'wc@2:core:0.3//subscription': Array<unknown>;
  'wc@2:client:0.3//request': Array<unknown>;
  'wc@2:core:0.3//history': Array<unknown>;
}

export interface GoogleFileId {
  id: string;
  token: string;
}

export interface TransactionHistoryItem {
  time: number | string;
  networkKey: string;
  change: string;
  changeSymbol?: string; // if undefined => main token
  fee?: string;
  feeSymbol?: string;
  // if undefined => main token, sometime "fee" uses different token than "change"
  // ex: sub token (DOT, AUSD, KSM, ...) of Acala, Karaura uses main token to pay fee
  isSuccess: boolean;
  action: 'send' | 'received';
  extrinsicHash: string;
  origin?: 'app' | 'network';
  eventIdx?: number | null;
}

export interface RequestAuthorizeCancel {
  id: string;
}

type WarningValueName =
  | 'mnemonicSequence'
  | 'mnemonic'
  | 'substrateDP'
  | 'ethereumDP'
  | 'rawSeed'
  | 'jsonPassword'
  | 'jsonInvalid'
  | 'isNotSamePassword'
  | 'duplicateMobileWallet'
  | '';

interface ValidateJsonResultPositive {
  value: true;
}

interface ValidateJsonResultNegative {
  value: false;
  errorType: WarningValueName;
}

export type ValidateJsonResult = ValidateJsonResultPositive | ValidateJsonResultNegative;

export type ResponseTotalBalances = {
  address: string;
  total: number;
  change: ChangeWalletBalance;
};

export interface TokenBalance {
  mainNetwork: string;
  assetId: string;
  priceId?: string;
  tokenName: string;
  symbol: string;
  precision: number;
  relayChain: RelayChainName;
  icon: string;
  providers: BuyProvider[];
  balances: BalanceItem[];
  color?: string;
}

export type BalanceMap = Record<WalletAddress, TokenBalance[]>;

export type NetworkMap = Record<string, NetworkJson>;
