/* eslint-disable no-use-before-define */
import { type NftTx, type NftSettings } from '@extension-base/services/nft-service/types';
import { type SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { ScamInfo } from '@extension-base/services/scam-service/types';
import type { ALLOWED_PATH } from '@extension-base/defaults';
import type { Subscription } from 'rxjs';
import type { JsonRpcProvider, WebSocketProvider } from 'ethers';
import type { CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import type { UserType } from '@extension-base/services/onboarding-service/types';
import type { NETWORK_STATUS } from '@extension-base/api/types/networks';
import type MetadataStore from '@extension-base/stores/Metadata';
import type { ProviderInterface } from '@polkadot/rpc-provider/types';
import type { WsProvider } from '@polkadot/rpc-provider';
import type { ApiPromise } from '@polkadot/api';
import type { HexString } from '@polkadot/util/types';
import type { KeyringPair$Json, KeyringPair } from '@polkadot/keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import type { RequestSignatures } from '@extension-base/background/types/messages';
import type { TypeRegistry } from '@polkadot/types';
import type { SignerResult } from '@polkadot/types/types/extrinsic';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { MetadataDef, ProviderList, ProviderMeta } from '@polkadot/extension-inject/types';
import type {
  NetworkName,
  WalletAddress,
  AssetName,
  ChangeWalletBalance,
  RelayChainName,
  BuyProvider,
  MarketType,
  SwapOptions,
} from '@/interfaces';
import { type WarningValueName } from '@/consts/messages';

type KeysWithDefinedValues<T> = {
  [K in keyof T]: T[K] extends undefined ? never : K;
}[keyof T];

type NoUndefinedValues<T> = {
  [K in KeysWithDefinedValues<T>]: T[K];
};

type IsNull<T, K extends keyof T> = { [K1 in Exclude<keyof T, K>]: T[K1] } & T[K] extends null ? K : never;

type NullKeys<T> = { [K in keyof T]: IsNull<T, K> }[keyof T];

export type Port = chrome.runtime.Port;

export interface AccountJson extends FWKeyringMeta {
  address: string;
  ethereumAddress: string;
  genesisHash?: HexString | null;
  network?: string;
  active?: boolean;
  name: string;
  suri?: string;
  type?: KeypairType;
  whenCreated?: number;
  //mobile properties
  isMobile?: boolean;
  wcTopic?: string;
  chains?: string[];
}

export interface ApproveAuthRequest {
  id: string;
  accounts: string[];
}

export interface AuthorizeRequest {
  id: string;
  request: RequestAuthorizeTab;
  url: string;
  accountAuthType: AccountAuthType;
}

export interface ServiceInfo {
  networkMap: Record<string, NetworkJson>;
  apiMap: ApiMap;
  isLock?: boolean;
  currentAccountInfo: CurrentAccountState;
}

export interface MetadataRequest {
  id: string;
  request: MetadataDef;
  url: string;
}

export type AccountAuthType = 'substrate' | 'evm' | 'both';

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

export interface MobileSignRequest extends Resolver<ResponseSigning> {
  id: string;
  request: SignerPayloadRaw;
}

export type RequestSigningSubscribe = null;

export interface RequestAddressCreate {
  address: string;
  meta: FWKeyringMeta;
}

export interface FetchBalanceRequest {
  address: string;
  networkName: NetworkName;
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

export interface RequestCurrentAccountAddress {
  address: string;
}

export type MessageTypes = keyof RequestSignatures;

// Requests

export type RequestTypes = {
  [MessageType in MessageTypes]: RequestSignatures[MessageType][0];
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

export type AuthType = 'substrate' | 'evm';
export interface RequestUpdateAuthorizedAccounts {
  url: string;
  authorizedAccounts: string[];
  authType: AuthType;
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
  meta: FWKeyringMeta;
}

export interface BalanceJson {
  reset?: boolean;
  details: TokenGroup[];
  saveSequence?: boolean;
}

export interface RequestMobileSign {
  id: string;
}

export interface PriceJson {
  ready?: boolean;
  currency: string;
  tokenPriceMap: Record<string, number>;
  tokenPriceChange: Record<string, number>;
}

export enum TransferErrorCode {
  TRANSFER_ERROR = 'transferError',
  CROSSCHAIN_ERROR = 'crossChainError',
  SWAP_ERROR = 'swapError',
  BOND_ERROR = 'bondError',
  BONDEXTRA_ERROR = 'bondExtraError',
  ADD_LIQUIDITY_ERROR = 'addLiquidityError',
  REMOVE_LIQUIDITY_ERROR = 'removeLiquidityError',
  UNBOND_ERROR = 'unbondError',
  REBOND_ERROR = 'rebondError',
  REDEEM_ERROR = 'redeemError',
  SET_CONTROLLER_ERROR = 'setControllerError',
  NOMINATE_ERROR = 'nominateError',
  SET_PAYEE_ERROR = 'setPayeeError',
  PAYOUT_REWARDS_ERROR = 'payoutRewardsError',
  UNSUPPORTED = 'unsupported',
}

export enum BasicTxErrorCode {
  INVALID_PARAM = 'invalidParam',
  KEYRING_ERROR = 'keyringError',
  BALANCE_TO_LOW = 'balanceTooLow',
  INVALID_PASSWORD = 'invalidPassword',
}

export interface BasicTxResponse {
  passwordError?: string | null;
  status?: boolean;
  errors?: BasicTxError[];
}

export enum SignerType {
  PASSWORD = 'PASSWORD',
  MOBILE = 'MOBILE',
}

export interface PrepareExternalRequest {
  id: string;
  setState: (promise: ExternalRequestPromise) => void;
  updateState: (promise: Partial<ExternalRequestPromise>) => void;
}

export type TxErrorCode = TransferErrorCode | BasicTxErrorCode;

export type BasicTxError = {
  code?: TxErrorCode;
  data?: object;
  message: string;
};

export interface ApiProps {
  api?: ApiPromise;
  provider?: WsProvider;
  apiStatus: NETWORK_STATUS;
  apiRetry: number;
  nodeIndex: number;
  isEthereum: boolean;
}

export interface EvmApiProps {
  api?: EvmProvider;
  apiRetry?: number;
  nodeIndex?: number;
  timeout: Record<string, number>;
}

export type FetchEvmBalancePayload = {
  _networks?: NetworkName[];
  ethereumAddress?: string;
  assetId?: string;
  force?: boolean;
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
}

export interface RequestCheckCrossChain extends BaseRequestSign {
  originNet: NetworkName;
  destinationNet: NetworkName;
  from: string;
  to: string;
  assetId: string;
  relayChain?: RelayChainName;
  amount?: string;
}

export interface ResponseCheckTransfer {
  estimateFee?: string;
  destEstimateFee: '0';
  errors?: BasicTxError[];
}

export interface ResponseCheckCrossChain {
  estimateFee?: string;
  destEstimateFee?: string;
  errors?: BasicTxError[];
}

export interface RequestCheckScam {
  address: string;
  network: NetworkName;
}

export interface ResponseCheckScam {
  value: boolean;
  info?: ScamInfo;
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
  swapOptions?: SwapOptions;
  amountA: string;
  amountB: string;
  AToB: string;
  BToA: string;
  networkFee?: string;
  minMaxValue: string;
  route: string;
}

export type PasswordRequestSign<T extends BaseRequestSign> = T & {
  password: string;
  isSavePass: boolean;
  isMobile: boolean;
};

export interface ResponseMakeSwap {
  errors?: Array<BasicTxError>;
  status: boolean;
}

export type ExternalRequestSign<T extends BaseRequestSign> = Omit<T, 'password'>;

export interface RequestSwap extends PasswordRequestSign<RequestCheckSwap> {
  feeSymbol?: string;
}

export type RequestTransfer = PasswordRequestSign<RequestCheckTransfer>;

export type RequestCrossChain = PasswordRequestSign<RequestCheckCrossChain>;
export type RequestNftTransfer = PasswordRequestSign<NftTx>;
export type ResponseNftTransfer = {
  errors: Array<BasicTxError>;
  hash?: string;
  status: boolean;
};
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
  meta: FWKeyringMeta;
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
  network?: string;
}

export interface ResponseAccountExport {
  json: KeyringPair$Json;
}

export interface RequestExportMnemonic {
  address: string;
  password: string;
}

export interface ResponseExportMnemonic {
  seed: string;
}

export type EvmProvider = JsonRpcProvider | WebSocketProvider;

export type EvmApiMap = Record<string, EvmApiProps>;

export interface ApiMap {
  substrate: Record<string, ApiProps>;
  evm: EvmApiMap;
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
  address: string;
}

export interface ResponseSigningIsLocked {
  isLocked: boolean;
  remainingTime: number;
}

// Responses

export type ResponseTypes = {
  [MessageType in MessageTypes]: RequestSignatures[MessageType][1];
};

export type ResponseType<TMessageType extends MessageTypes> = RequestSignatures[TMessageType][1];

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

export type ResponseRpcListProviders = ProviderList;

// Subscriptions

export type SubscriptionMessageTypes = NoUndefinedValues<{
  [MessageType in MessageTypes]: RequestSignatures[MessageType][2];
}>;

export type MessageTypesWithSubscriptions = keyof SubscriptionMessageTypes;
export type MessageTypesWithNoSubscriptions = Exclude<MessageTypes, keyof SubscriptionMessageTypes>;

export interface RequestSign {
  readonly payload: SignerPayloadJSON | SignerPayloadRaw;
  sign(registry: TypeRegistry, pair: KeyringPair): Promise<{ signature: HexString }>;
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
  currentEvmNetworkKey?: string;
}

export interface ResponseSigning {
  id: string;
  payload: HexString;
}

export interface AuthUrlInfo {
  count: number;
  id: string;
  isAllowed: boolean;
  origin: string;
  url: string;
  accountAuthType?: AccountAuthType;
  authorizedAccounts: string[];
  evmAuthorizedAccount: string;
  allowedAccountsMap: Record<string, boolean>;
  currentEvmNetworkKey?: string;
}

export type AuthUrls = Record<string, AuthUrlInfo>;

export type AuthorizedAccountsDiff = [
  url: string,
  authorizedAccounts: AuthUrlInfo['authorizedAccounts'],
  authType: AuthType
][];

export interface MetaRequest extends Resolver<boolean> {
  id: string;
  request: MetadataDef;
  url: string;
}

export interface AuthResponse {
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

export type CachedUnlocks = Record<string, number>;

export interface AccountSub {
  subscription: Subscription;
  url: string;
}

export type Subscriptions = Record<string, Port>;

export type Address = {
  name: string;
  address: string;
}[];

export type AddressBook = Record<NetworkName, Address>;

export type IState = {
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
  nftSettings: Record<string, NftSettings>;
  onboarding: {
    user: UserType;
    isRequired: boolean;
  };
  'wc@2:client:0.3//session': Array<unknown>;
  'wc@2:client:0.3//proposal': Array<unknown>;
  'wc@2:core:0.3//pairing': Array<unknown>;
  'wc@2:core:0.3//subscription': Array<unknown>;
  'wc@2:client:0.3//request': Array<unknown>;
  'wc@2:core:0.3//history': Array<unknown>;
};

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
  origin?: 'app' | 'network';
  eventIdx?: number | null;
}

export interface RequestAuthorizeCancel {
  id: string;
}

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

export interface TokenGroup {
  mainNetwork: string;
  groupId: string;
  priceId?: string;
  tokenName: string;
  symbol: string;
  relayChain: RelayChainName;
  icon: string;
  providers: BuyProvider[];
  balances: BalanceItem[];
  color?: string;
}

export type BalanceMap = Record<WalletAddress, TokenGroup[]>;

export type NetworkMap = Record<string, NetworkJson>;
export type NotificationResponse = { message: string; title: string; status: boolean };

export type EvmAppState = {
  networkKey?: string;
  chainId: string;
  isConnected?: boolean;
  web3?: EvmProvider;
};

export type TransformAccountPayload = {
  accounts: SubjectInfo;
  authInfo?: AuthUrlInfo;
  accountAuthType?: AccountAuthType;
};

export interface AddNetworkRequestExternal {
  // currently only support adding pure Evm network
  chainId: string;
  rpcUrls: string[];
  chainName: string;
  blockExplorerUrls?: string[];
  requestId?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}
