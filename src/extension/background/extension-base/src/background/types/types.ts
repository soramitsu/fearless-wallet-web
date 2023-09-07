// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-use-before-define */

import { TypeRegistry } from '@polkadot/types';
import { Subscription } from 'rxjs';
import { ALLOWED_PATH } from '@extension-base/defaults';
import { RequestSignatures } from '@extension-base/background/types/messages';
import { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import { BN } from '@polkadot/util';
import { JsonRpcProvider } from 'ethers';
import { BalanceItem } from '../../api/evm/types/ether';
import { UserType } from '../../services/onboarding-service/types';
import { CurrentAccountState } from '../../stores/CurrentAccountStore';
import MetadataStore from '../../stores/Metadata';
import { NetworkJson } from '../../types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { HexString } from '@polkadot/util/types';
import type { ProviderInterface } from '@polkadot/rpc-provider/types';
import type { KeyringPair, KeyringPair$Json, KeyringPair$Meta } from '@polkadot/keyring/types';
import type { MetadataDef, ProviderList, ProviderMeta } from '@polkadot/extension-inject/types';
import type {
  AccountAuthType,
  AccountJson,
  AddressBook,
  ApiProps,
  AuthUrlInfo,
  TransactionHistoryItem,
} from '@extension-base/background/types';
import { NetworkName, WalletAddress, AssetName, ChangeWalletBalance, RelayChainName, BuyProvider } from '@/interfaces';

type KeysWithDefinedValues<T> = {
  [K in keyof T]: T[K] extends undefined ? never : K;
}[keyof T];

type NoUndefinedValues<T> = {
  [K in KeysWithDefinedValues<T>]: T[K];
};

type IsNull<T, K extends keyof T> = { [K1 in Exclude<keyof T, K>]: T[K1] } & T[K] extends null ? K : never;

type NullKeys<T> = { [K in keyof T]: IsNull<T, K> }[keyof T];

export type Port = chrome.runtime.Port;

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

export type RequestAuthorizeSubscribe = null;

export interface RequestMetadataApprove {
  id: string;
}

export interface RequestMetadataReject {
  id: string;
}

export type RequestMetadataSubscribe = null;

export interface RequestAccountCreateSuri {
  password: string;
  suri: string;
  type?: KeypairType;
  meta: KeyringPair$Meta;
}

export interface RequestAccountCreateHardware {
  accountIndex: number;
  address: string;
  addressOffset: number;
  genesisHash: string;
  hardwareType: string;
  name: string;
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

export interface ResponseJsonRestore {
  error: string | null;
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

export interface RequestGoogleCreateFile {
  data: Record<string, string>;
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

export type BeaconRawSignCallBack = (tx: SignerPayloadRaw) => string;

export type BalanceMap = Record<WalletAddress, TokenBalance[]>;
export type NetworkMap = Record<string, NetworkJson>;
