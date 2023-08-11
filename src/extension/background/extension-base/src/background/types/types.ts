// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-use-before-define */
import { BN } from '@polkadot/util';
import { Subscription } from 'rxjs';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { ALLOWED_PATH } from '@extension-base/defaults';
import MetadataStore from '@extension-base/stores/Metadata';
import { NetworkJson } from '@extension-base/types';
import { JsonRpcProvider } from 'ethers';
import type { RequestSignatures } from '@extension-base/background/types/messages';
import type { CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import type { SubmittableExtrinsicFunction } from '@polkadot/api/promise/types';
import type { TypeRegistry } from '@polkadot/types';
import type { SignerResult } from '@polkadot/types/types/extrinsic';
import type { Registry, SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import type { MetadataDef, ProviderList, ProviderMeta } from '@polkadot/extension-inject/types';
import type { KeyringPair, KeyringPair$Json, KeyringPair$Meta } from '@polkadot/keyring/types';
import type { ProviderInterface } from '@polkadot/rpc-provider/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { HexString } from '@polkadot/util/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type {
  RelayChainName,
  SwapOptions,
  MarketType,
  WalletAddress,
  ChangeWalletBalance,
  NetworkName,
  AssetName,
} from '@/interfaces';

export interface PrepareExternalRequest {
  id: string;
  setState: (promise: ExternalRequestPromise) => void;
  updateState: (promise: Partial<ExternalRequestPromise>) => void;
}
export enum SignerType {
  PASSWORD = 'PASSWORD',
  MOBILE = 'MOBILE',
}

type KeysWithDefinedValues<T> = {
  [K in keyof T]: T[K] extends undefined ? never : K;
}[keyof T];

type NoUndefinedValues<T> = {
  [K in KeysWithDefinedValues<T>]: T[K];
};

type IsNull<T, K extends keyof T> = { [K1 in Exclude<keyof T, K>]: T[K1] } & T[K] extends null ? K : never;

type NullKeys<T> = { [K in keyof T]: IsNull<T, K> }[keyof T];

export type SeedLengths = 12 | 24;
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

export type AccountWithChildren = AccountJson & {
  children?: AccountWithChildren[];
};

export type AccountsContext = {
  accounts: AccountJson[];
  hierarchy: AccountWithChildren[];
  master?: AccountJson;
  selectedAccounts?: AccountJson['address'][];
  setSelectedAccounts?: (address: AccountJson['address'][]) => void;
};

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

export interface Features {
  showSoraCard?: boolean;
}

export interface SigningRequest {
  account: AccountJson;
  id: string;
  request: RequestSign;
  url: string;
}
export interface MobileSigningRequest {
  id: string;
  request: SignerPayloadRaw;
}

export interface RequestAddressCreate {
  address: string;
  meta: KeyringPair$Meta;
}

export interface RequestAddressRemove {
  address: string;
}
export interface SubscribeBalanceRequest {
  id: string;
  port: Port;
}

export enum NETWORK_ERROR {
  INVALID_INFO_TYPE = 'invalidInfoType',
  INJECT_SCRIPT_DETECTED = 'injectScriptDetected',
  EXISTED_NETWORK = 'existedNetwork',
  EXISTED_PROVIDER = 'existedProvider',
  INVALID_PROVIDER = 'invalidProvider',
  NONE = 'none',
  CONNECTION_FAILURE = 'connectionFailure',
  PROVIDER_NOT_SAME_NETWORK = 'providerNotSameNetwork',
}

export type NetWorkGroup =
  | 'RELAY_CHAIN'
  | 'POLKADOT_PARACHAIN'
  | 'KUSAMA_PARACHAIN'
  | 'MAIN_NET'
  | 'TEST_NET'
  | 'UNKNOWN';

export interface ValidateNetworkResponse {
  success: boolean;
  key: string;
  genesisHash: string;
  ss58Prefix: string;
  // networkGroup: NetWorkGroup[];
  chain: string;
  evmChainId: number;
  nativeToken?: string;
  decimal?: number;
  error?: NETWORK_ERROR;
  conflictChain?: string;
  conflictKey?: string;
}

export interface ValidateNetworkRequest {
  provider: string;
  isEthereum: boolean;
  existedNetwork?: NetworkJson;
}
export interface DisableNetworkResponse {
  success: boolean;
  activeNetworkCount?: number;
}

export type RequestPrice = null;
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
}

export interface RequestAuthorizeApprove {
  id: string;
  authorizedAccounts: string[];
}

export interface RequestMobileSign {
  signature: `0x${string}`;
  id: string;
}

export interface RequestUpdateAuthorizedAccounts {
  url: string;
  authorizedAccounts: string[];
}

export type RequestAuthorizeSubscribe = null;

export interface RequestMetadataApprove {
  id: string;
}

export interface RequestMetadataReject {
  id: string;
}

export type RequestMetadataSubscribe = null;

export interface RequestAccountCreateExternal {
  address: string;
  genesisHash?: HexString | null;
  name: string;
}

export interface RequestAccountCreateSuri {
  suri: string;
  password: string;
  type?: KeypairType;
  meta?: Record<string, unknown>;
}

export interface PriceJson {
  ready?: boolean;
  currency: string;
  priceMap: Record<string, number>;
  tokenPriceMap: Record<string, number>;
  tokenPriceChange: Record<string, number>;
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
export interface DefaultFormatBalance {
  decimals?: number[] | number;
  unit?: string[] | string;
}
export interface ApiState {
  apiDefaultTx: SubmittableExtrinsicFunction;
  apiDefaultTxSudo: SubmittableExtrinsicFunction;
  isApiInitialized: boolean;
  isApiReady: boolean;
  isDevelopment?: boolean;
  isEthereum?: boolean;
  specName: string;
  specVersion: string;
  systemChain: string;
  systemName: string;
  systemVersion: string;
  registry: Registry;
  defaultFormatBalance: DefaultFormatBalance;
}
export interface ApiProps extends ApiState {
  api?: ApiPromise;
  provider?: WsProvider;
  apiError?: string;
  apiUrl: string;
  isNotSupport?: boolean;
  isApiConnected: boolean;
  tryAnotherNode: boolean;
  isEthereum: boolean;
  isEthereumOnly: boolean;
  isApiInitialized: boolean;
  isReady: Promise<ApiProps>;
  apiRetry: number;
  nodeIndex: number;
  useEvmAddress?: boolean;
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

export interface RequestAccountChangePassword {
  address: string;
  oldPass: string;
  newPass: string;
}

export interface RequestAccountEdit {
  address: string;
  genesisHash?: string | null;
  name: string;
}

export interface RequestAccountForget {
  address: string;
  type: 'native' | 'mobile';
}

export interface RequestUpdateMeta {
  address: string;
  meta: KeyringPair$Meta;
}

export interface RequestAccountShow {
  address: string;
  isShowing: boolean;
}

export interface RequestAccountTie {
  address: string;
  genesisHash: HexString | null;
}

export interface RequestAccountName {
  address: string;
  name: string;
}

export interface RequestAccountValidate {
  address: string;
  password: string;
}

export interface RequestDeriveCreate {
  name: string;
  genesisHash?: HexString | null;
  suri: string;
  parentAddress: string;
  parentPassword: string;
  password: string;
}

export interface RequestDeriveValidate {
  suri: string;
  parentAddress: string;
  parentPassword: string;
}

export interface RequestAccountExport {
  address: string;
  password: string;
}
export interface TokenBalanceRaw {
  reserved: BN;
  frozen: BN;
  free: BN;
}
export interface ApiMap {
  substrate: Record<string, ApiProps>;
  evm: Record<string, JsonRpcProvider>;
}

export interface ServiceInfo {
  networkMap: Record<string, NetworkJson>;
  apiMap: ApiMap;
  isLock?: boolean;
  currentAccountInfo: CurrentAccountState;
}

export interface RequestAccountBatchExport {
  addresses: string[];
  password: string;
}

export interface RequestAccountList {
  anyType?: boolean;
}

export type RequestAccountSubscribe = null;

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
  address: string;
}

export interface ResponseSigningIsLocked {
  isLocked: boolean;
  remainingTime: number;
}

export type RequestSigningSubscribe = null;

export type RequestSaveTimeoutCache = { address: string; isSavePass: boolean };

export interface RequestSeedCreate {
  length?: SeedLengths;
  seed?: string;
  type?: KeypairType;
}

export interface RequestSeedValidate {
  suri: string;
  type?: KeypairType;
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

export interface ResponseDeriveValidate {
  address: string;
  suri: string;
}

export interface ResponseSeedCreate {
  address: string;
  seed: string;
}

export interface ResponseSeedValidate {
  address: string;
  suri: string;
}

export interface ResponseAccountExport {
  exportedJson: KeyringPair$Json;
}

export interface ResponseAccountsExport {
  exportedJson: KeyringPairs$Json;
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
export interface RequestSignJSON {
  readonly payload: SignerPayloadJSON | SignerPayloadRaw | undefined;

  sign(): { signature: HexString };
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

export interface RequestBatchRestore {
  file: KeyringPairs$Json;
  password: string;
}

export interface ResponseJsonRestore {
  error: string | null;
}
type TAllowPath = typeof ALLOWED_PATH;
export type AllowedPath = TAllowPath[number];

export interface ResponseJsonGetAccountInfo {
  address: string;
  ethereumAddress: string;
  name: string;
  genesisHash: string;
  type: KeypairType;
}

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
}

export type AuthUrls = Record<string, AuthUrlInfo>;

export type Address = {
  name: string;
  address: string;
}[];

export type AddressBook = Record<NetworkName, Address>;

export type AuthorizedAccountsDiff = [url: string, authorizedAccounts: AuthUrlInfo['authorizedAccounts']][];

export type AccountAuthType = 'substrate' | 'evm' | 'both';

export interface AuthUrlInfo {
  count: number;
  id: string;
  isAllowed: boolean;
  origin: string;
  url: string;
  accountAuthType?: AccountAuthType;
  authorizedAccounts: string[];
  isAllowedMap: Record<string, boolean>;
  currentEvmNetworkKey?: string;
}

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
export interface MobileSignRequest extends Resolver<ResponseSigning> {
  id: string;
  request: SignerPayloadRaw;
}

const NOTIFICATION_URL = chrome.runtime.getURL('popup.html');

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
  selectedNetwork: Record<string, string>;
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
}

export interface GoogleFileId {
  id: string;
  token: string;
}

export interface RequestGoogleCreateFile {
  data: Record<string, string>;
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
export interface FormattedMethod {
  args?: ArgInfo[];
  methodName: string;
}

export interface ArgInfo {
  argName: string;
  argValue: string | string[];
}

export interface EraInfo {
  period: number;
  phase: number;
}

export interface ResponseParseTransactionSubstrate {
  era: EraInfo | string;
  nonce: number;
  method: string | FormattedMethod[];
  tip: number;
  specVersion: number;
  message: string;
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

export interface RequestAccountMeta {
  address: string | Uint8Array;
}

export interface ResponseAccountMeta {
  meta: KeyringPair$Meta;
}

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
  providers: string[];
  balances: BalanceItem[];
  color?: string;
}

export type BeaconRawSignCallBack = (tx: SignerPayloadRaw) => string;

export type BalanceMap = Record<WalletAddress, TokenBalance[]>;
export type NetworkMap = Record<string, NetworkJson>;
