// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-use-before-define */
import { SignerResult } from '@polkadot/types/types/extrinsic';
import { TypeRegistry } from '@polkadot/types';
import { Registry } from '@polkadot/types/types';
import { SubmittableExtrinsicFunction } from '@polkadot/api/promise/types';
import { BN } from '@polkadot/util';
import { Subscription } from 'rxjs';
import { ApiPromise } from '@polkadot/api';
import { ALLOWED_PATH } from '../defaults';
import MetadataStore from '../stores/Metadata';
import { BalanceItem, NetworkJson } from '../api/evm/types/ether';
import { ChainRegistry } from '../api/evm/utils/registery';
import { CurrentAccountInfo } from '../stores/CurrentAccountStore';
import EthProvider from '../api/evm/ethProvider';
import { RequestTransactionHistoryAdd, RequestTransactionHistoryGet, TransactionHistoryItemType } from '../types';
import type {
  InjectedAccount,
  InjectedMetadataKnown,
  MetadataDef,
  ProviderList,
  ProviderMeta,
} from '@polkadot/extension-inject/types';
import type { KeyringPair, KeyringPair$Json, KeyringPair$Meta } from '@polkadot/keyring/types';
import type { JsonRpcResponse, ProviderInterface } from '@polkadot/rpc-provider/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { KeyringAddress, KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { HexString } from '@polkadot/util/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import {
  FilesResponse,
  GoogleAuthTypes,
  ICreateFile,
  IGetFilesResponse,
  VerifyTokenResponse,
} from '@/interfaces/google';
export interface PrepareExternalRequest {
  id: string;
  setState: (promise: ExternalRequestPromise) => void;
  updateState: (promise: Partial<ExternalRequestPromise>) => void;
}
export enum SignerType {
  PASSWORD = 'PASSWORD',
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
  genesisHash?: string | null;
  isExternal?: boolean;
  isHardware?: boolean;
  isMobile?: boolean;
  isHidden?: boolean;
  isDefaultAuthSelected?: boolean;
  name?: string;
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

export interface RequestAddressRemove {
  address: string;
}
export interface SubscribeBalanceRequest {
  id: string;
  port: Port;
}
export type ConnectedTabsUrlResponse = string[];

// [MessageType]: [RequestType, ResponseType, SubscriptionMessageType?]
export interface RequestSignatures {
  // private/internal requests, i.e. from a popup
  //Account Managment
  'pri(accounts.create.external)': [RequestAccountCreateExternal, boolean];
  'pri(accounts.create.hardware)': [RequestAccountCreateHardware, boolean];
  'pri(accounts.create.suri)': [RequestAccountCreateSuri, boolean];
  'pri(addresses.create)': [RequestAddressCreate, boolean];
  'pri(addresses.remove)': [RequestAddressRemove, boolean];
  'pri(addresses.get)': [null, KeyringAddress[]];
  'pri(accounts.edit)': [RequestAccountEdit, boolean];
  'pri(accounts.export)': [RequestAccountExport, ResponseAccountExport];
  'pri(accounts.batchExport)': [RequestAccountBatchExport, ResponseAccountsExport];
  'pri(accounts.forget)': [RequestAccountForget, boolean];
  'pri(accounts.list)': [RequestAccountList, InjectedAccount[]];
  'pri(accounts.show)': [RequestAccountShow, boolean];
  'pri(accounts.tie)': [RequestAccountTie, boolean];
  'pri(accounts.subscribe)': [RequestAccountSubscribe, boolean, AccountJson[]];
  'pri(accounts.validate)': [RequestAccountValidate, boolean];
  'pri(accounts.changePassword)': [RequestAccountChangePassword, boolean];
  'pri(accounts.current.saveAddress)': [RequestCurrentAccountAddress, boolean, CurrentAccountInfo];
  'pri(accounts.update.current)': [string, boolean];

  //Authorize
  'pri(authorize.approve)': [RequestAuthorizeApprove, boolean];
  'pri(authorize.list)': [null, ResponseAuthorizeList];
  'pri(authorize.requests)': [RequestAuthorizeSubscribe, boolean, AuthorizeRequest[]];
  'pri(authorize.remove)': [string, ResponseAuthorizeList];
  'pri(authorize.delete.request)': [string, void];
  'pri(authorize.cancel)': [string, boolean];
  'pri(authorize.update)': [RequestUpdateAuthorizedAccounts, void];
  'pri(activeTabsUrl.update)': [RequestActiveTabsUrlUpdate, void];
  'pri(connectedTabsUrl.get)': [null, ConnectedTabsUrlResponse];
  'pri(derivation.create)': [RequestDeriveCreate, boolean];
  'pri(derivation.validate)': [RequestDeriveValidate, ResponseDeriveValidate];
  'pri(json.restore)': [RequestJsonRestore, void];
  'pri(json.valid)': [RequestJsonRestore, boolean];
  'pri(json.batchRestore)': [RequestBatchRestore, void];
  'pri(json.account.info)': [KeyringPair$Json, ResponseJsonGetAccountInfo];
  'pri(metadata.approve)': [RequestMetadataApprove, boolean];
  'pri(metadata.get)': [string | null, MetadataDef | null];
  'pri(metadata.reject)': [RequestMetadataReject, boolean];
  'pri(metadata.requests)': [RequestMetadataSubscribe, boolean, MetadataRequest[]];
  'pri(metadata.list)': [null, MetadataDef[]];
  'pri(seed.create)': [RequestSeedCreate, ResponseSeedCreate];
  'pri(seed.validate)': [RequestSeedValidate, ResponseSeedValidate];
  'pri(settings.notification)': [string, boolean];
  'pri(signing.approve.password)': [RequestSigningApprovePassword, boolean];
  'pri(signing.approve.signature)': [RequestSigningApproveSignature, boolean];
  'pri(signing.cancel)': [RequestSigningCancel, boolean];
  'pri(signing.isLocked)': [RequestSigningIsLocked, ResponseSigningIsLocked];
  'pri(signing.requests)': [RequestSigningSubscribe, boolean, SigningRequest[]];
  'pri(window.open)': [AllowedPath, boolean];
  'pri(signing.refreshPasswordTimeout)': [string, number];
  'pri(signing.resetTimeouts)': [null, boolean];
  'pri(signing.saveTimeoutCache)': [string, boolean];
  'pri(google.auth)': [GoogleAuthTypes, void];
  'pri(google.verify.token)': [{ token: string }, VerifyTokenResponse];
  'pri(google.get.files)': [{ token: string }, IGetFilesResponse];
  'pri(google.get.file)': [GoogleFileId, KeyringPair$Json];
  'pri(google.create.file)': [ICreateFile, FilesResponse];
  'pri(google.delete.file)': [GoogleFileId, void];
  'pri(tab.status)': [null, ActiveTabAuthorizeStatus];
  //Transfer
  'pri(accounts.checkTransfer)': [RequestCheckTransfer, ResponseCheckTransfer];
  'pri(accounts.transfer)': [RequestTransfer, BasicTxResponse, BasicTxResponse];

  //ether
  'pri(balance.get.balance)': [null, BalanceJson];
  'pri(balance.get.subscription)': [null, BalanceJson, BalanceJson];
  'pri(transaction.history.get.subscription)': [
    null,
    Record<string, TransactionHistoryItemType[]>,
    Record<string, TransactionHistoryItemType[]>
  ];
  'pri(transaction.history.add)': [RequestTransactionHistoryAdd, boolean, TransactionHistoryItemType[]];
  'pri(transaction.history.get)': [RequestTransactionHistoryGet, any];
  'pri(price.get.price)': [RequestPrice, PriceJson];
  'pri(price.get.subscription)': [RequestSubscribePrice, PriceJson, PriceJson];

  // public/external requests, i.e. from a page
  'pub(accounts.list)': [RequestAccountList, InjectedAccount[]];
  'pub(accounts.subscribe)': [RequestAccountSubscribe, string, InjectedAccount[]];
  'pub(accounts.unsubscribe)': [RequestAccountUnsubscribe, boolean];
  'pub(authorize.tab)': [RequestAuthorizeTab, Promise<AuthResponse>];
  'pub(bytes.sign)': [SignerPayloadRaw, ResponseSigning];
  'pub(extrinsic.sign)': [SignerPayloadJSON, ResponseSigning];
  'pub(metadata.list)': [null, InjectedMetadataKnown[]];
  'pub(metadata.provide)': [MetadataDef, boolean];
  'pub(phishing.redirectIfDenied)': [null, boolean];
  'pub(rpc.listProviders)': [void, ResponseRpcListProviders];
  'pub(rpc.send)': [RequestRpcSend, JsonRpcResponse];
  'pub(rpc.startProvider)': [string, ProviderMeta];
  'pub(rpc.subscribe)': [RequestRpcSubscribe, number, JsonRpcResponse];
  'pub(rpc.subscribeConnected)': [null, boolean, boolean];
  'pub(rpc.unsubscribe)': [RequestRpcUnsubscribe, boolean];
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
  genesisHash?: string | null;
  name: string;
}

export interface RequestAccountCreateSuri {
  name: string;
  genesisHash?: string | null;
  password: string;
  suri: string;
  type?: KeypairType;
  meta?: Record<string, unknown>;
}

export interface RequestAccountCreateHardware {
  accountIndex: number;
  address: string;
  addressOffset: number;
  genesisHash: string;
  hardwareType: string;
  name: string;
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
  details: Record<string, BalanceItem>;
}

export enum TransferErrorCode {
  NOT_ENOUGH_VALUE = 'notEnoughValue',
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
  BALANCE_TO_LOW = 'balanceTooLow1',
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
  code: TxErrorCode;
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
  api: ApiPromise;
  apiError?: string;
  apiUrl: string;
  isNotSupport?: boolean;
  isApiConnected: boolean;
  isEthereum: boolean;
  isEthereumOnly: boolean;
  isApiInitialized: boolean;
  isReady: Promise<ApiProps>;
  apiRetry?: number;
  recoverConnect?: () => void;
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
  networkKey: string;
  from: string;
  to: string;
  value?: string;
  transferAll?: boolean;
  token?: string;
}

export interface ResponseCheckTransfer {
  errors?: Array<BasicTxError>;
  warnings?: Array<BasicTxWarning>;
  fromAccountFree: string;
  toAccountFree: string;
  estimateFee?: string;
  feeSymbol?: string; // if undefined => use main token
}

export type PasswordRequestSign<T extends BaseRequestSign> = T & { password: string };

export type ExternalRequestSign<T extends BaseRequestSign> = Omit<T, 'password'>;

export type RequestTransfer = PasswordRequestSign<RequestCheckTransfer>;
export interface RequestAccountExportPrivateKey {
  address: string;
  password: string;
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

export interface RequestAccountShow {
  address: string;
  isShowing: boolean;
}

export interface RequestAccountTie {
  address: string;
  genesisHash: string | null;
}

export interface RequestAccountValidate {
  address: string;
  password: string;
}

export interface RequestDeriveCreate {
  name: string;
  genesisHash?: string | null;
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
  evm: Record<string, EthProvider>;
}
export interface ServiceInfo {
  networkMap: Record<string, NetworkJson>;
  apiMap: ApiMap;
  isLock?: boolean;
  currentAccountInfo: CurrentAccountInfo;
  chainRegistry: Record<string, ChainRegistry>;
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
  id: string;
}

export interface ResponseSigningIsLocked {
  isLocked: boolean;
  remainingTime: number;
}

export type RequestSigningSubscribe = null;

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

const NOTIFICATION_URL = chrome.runtime.getURL('popup.html');

export const POPUP_WINDOW_OPTS: chrome.windows.CreateData = {
  focused: true,
  height: 640,
  width: 561,
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
  defaultAuthAccountSelection: string[];
  injectedProviders: Map<Port, ProviderInterface>;
  notification: string;
  subscriptions: Subscriptions;
  providers: Providers;
  accountSubs: Record<string, AccountSub>;
  windows: number[];
  cachedUnlocks: CachedUnlocks;
  balances: Record<string, Record<string, BalanceItem>>;
  connectedTabsUrl: string[];
  transaction: Record<string, TransactionHistoryItem[]>;
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

export interface SupportTransferResponse {
  supportTransfer: boolean;
  supportTransferAll: boolean;
}
export type ChainRelationType = 'p' | 'r'; // parachain | relaychain

export interface ChainRelationInfo {
  type: ChainRelationType;
  isEthereum: boolean;
  supportedToken: string[];
}
export interface CrossChainRelation {
  type: ChainRelationType;
  isEthereum: boolean;
  relationMap: Record<string, ChainRelationInfo>;
}
