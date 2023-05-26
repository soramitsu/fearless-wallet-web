// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-use-before-define */

import { TypeRegistry } from '@polkadot/types';
import { Subscription } from 'rxjs';
import { ALLOWED_PATH } from '@extension-base/defaults';
import { RequestSignatures } from '@extension-base/background/types/messages';
import type { MetadataDef, ProviderList, ProviderMeta } from '@polkadot/extension-inject/types';
import type { KeyringPair, KeyringPair$Json, KeyringPair$Meta } from '@polkadot/keyring/types';
import type { ProviderInterface } from '@polkadot/rpc-provider/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { HexString } from '@polkadot/util/types';
import type { KeypairType } from '@polkadot/util-crypto/types';

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

export type ConnectedTabsUrlResponse = string[];

// [MessageType]: [RequestType, ResponseType, SubscriptionMessageType?]

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

export interface RequestBatchRestore {
  file: KeyringPairs$Json;
  password: string;
}

export interface ResponseJsonRestore {
  error: string | null;
}

export type AllowedPath = (typeof ALLOWED_PATH)[number];

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

export interface AuthUrlInfo {
  count: number;
  id: string;
  // this is from pre-0.44.1
  isAllowed?: boolean;
  origin: string;
  url: string;
  authorizedAccounts: string[];
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
