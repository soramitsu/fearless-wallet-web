import {
  ValidatorsRequest,
  RequestBond,
  RequestBondExtra,
  RequestSetControllerAccount,
  RequestRebond,
  RequestRedeem,
  RequestUnbond,
} from '@extension-base/services/staking-service/types';
import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import type { NetworkJson } from '@extension-base/types';
import type {
  InjectedAccount,
  MetadataDef,
  InjectedMetadataKnown,
  ProviderMeta,
} from '@polkadot/extension-inject/types';
import type { JsonRpcResponse } from '@polkadot/rpc-provider/types';
import type {
  RequestAccountCreateSuri,
  RequestAddressCreate,
  RequestAccountExport,
  ResponseAccountExport,
  RequestAccountForget,
  RequestAccountList,
  RequestAccountName,
  AccountJson,
  RequestAccountValidate,
  RequestAuthorizeApprove,
  ResponseAuthorizeList,
  AuthorizeRequest,
  RequestUpdateAuthorizedAccounts,
  RequestActiveTabsUrlUpdate,
  RequestJsonRestore,
  RequestJsonValidate,
  ValidateJsonResult,
  RequestMetadataApprove,
  RequestMetadataReject,
  MetadataRequest,
  RequestSigningApprovePassword,
  RequestSigningApproveSignature,
  RequestSigningCancel,
  RequestSigningIsLocked,
  ResponseSigningIsLocked,
  SigningRequest,
  AllowedPath,
  GoogleFileId,
  ActiveTabAuthorizeStatus,
  RequestCheckTransfer,
  RequestCheckCrossChain,
  ResponseCheckTransfer,
  ResponseCheckCrossChain,
  RequestTransfer,
  RequestCrossChain,
  BasicTxResponse,
  BalanceJson,
  PriceJson,
  RequestSubscribePrice,
  RequestAccountUnsubscribe,
  RequestAuthorizeTab,
  AuthResponse,
  ResponseSigning,
  ResponseRpcListProviders,
  RequestRpcSend,
  RequestRpcSubscribe,
  RequestCheckSwap,
  ResponseCheckSwap,
  RequestSwap,
  ResponseMakeSwap,
  RequestUpdateMeta,
  ResponseTotalBalances,
  MobileSigningRequest,
} from '@extension-base/background/types/types';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type {
  DerivationPath,
  GoogleAuthTypes,
  VerifyTokenResponse,
  IGetFilesResponse,
  ICreateFile,
  FilesResponse,
  SignerPayloadJSON,
  SoraFees,
  SignerPayloadRaw,
  OnboardingStories,
} from '@/interfaces';

// [MessageType]: [RequestType, ResponseType, SubscriptionMessageType?]
export interface RequestSignatures {
  // private/internal requests, i.e. from a popup
  //Account Managment
  'pri(accounts.validate.path)': [DerivationPath, boolean];
  'pri(accounts.create)': [RequestAccountCreateSuri, string];
  'pri(accounts.create.mobile)': [RequestAddressCreate, boolean];
  'pri(addresses.create)': [RequestAddressCreate, boolean];
  'pri(accounts.update.meta)': [RequestUpdateMeta, boolean];
  'pri(accounts.export)': [RequestAccountExport, ResponseAccountExport];
  'pri(accounts.forget)': [RequestAccountForget, boolean];
  'pri(accounts.list)': [RequestAccountList, InjectedAccount[]];
  'pri(accounts.name)': [RequestAccountName, boolean];
  'pri(accounts.subscribe)': [null, AccountJson[], AccountJson[]];
  'pri(addresses.subscribe)': [null, AccountJson[], AccountJson[]];
  'pri(accounts.validate)': [RequestAccountValidate, boolean];
  'pri(accounts.update.current)': [string, boolean];
  'pri(accounts.update.currentNetwork)': [string, boolean];
  'pri(accounts.totalBalances)': [null, ResponseTotalBalances[]];

  //App Managment - networks
  // Network, APIs, Custom tokens functions
  'pri(app.port.ping)': [null, boolean];
  'pri(networkMap.upsert)': [NetworkJson, boolean];
  'pri(networkMap.getSubscription)': [null, Record<string, NetworkJson>, Record<string, NetworkJson>];
  'pri(networkMap.toggle.favorite)': [string, void];

  //Authorize
  'pri(authorize.approve.polkaswap)': [string[], null];
  'pri(authorize.approve)': [RequestAuthorizeApprove, boolean];
  'pri(authorize.list)': [null, ResponseAuthorizeList];
  'pri(authorize.requests)': [null, boolean, AuthorizeRequest[]];
  'pri(authorize.remove)': [string, ResponseAuthorizeList];
  'pri(authorize.delete.request)': [string, void];
  'pri(authorize.cancel)': [string, boolean];
  'pri(authorize.update)': [RequestUpdateAuthorizedAccounts, void];
  'pri(tabs.update.activeTabsUrl)': [RequestActiveTabsUrlUpdate, void];
  'pri(accounts.json.restore)': [RequestJsonRestore, string];
  'pri(accounts.json.valid)': [RequestJsonValidate, ValidateJsonResult];
  'pri(metadata.approve)': [RequestMetadataApprove, boolean];
  'pri(metadata.reject)': [RequestMetadataReject, boolean];
  'pri(metadata.requests)': [null, boolean, MetadataRequest[]];
  'pri(settings.notification)': [string, boolean];
  'pri(signing.approve.password)': [RequestSigningApprovePassword, boolean];
  'pri(signing.approve.signature)': [RequestSigningApproveSignature, boolean];
  'pri(signing.cancel)': [RequestSigningCancel, boolean];
  'pri(signing.isLocked)': [RequestSigningIsLocked, ResponseSigningIsLocked];
  'pri(signing.requests)': [null, boolean, SigningRequest[]];
  'pri(mobileSigning.tx)': [null, boolean, MobileSigningRequest[]];
  'pri(mobileSigning.approve.signature)': [RequestSigningApproveSignature, boolean];
  'pri(mobileSigning.cancel)': [RequestSigningCancel, boolean];

  'pri(window.open)': [AllowedPath, boolean];
  'pri(google.auth)': [GoogleAuthTypes, void];
  'pri(google.verify.token)': [{ token: string }, VerifyTokenResponse | null];
  'pri(google.get.files)': [{ token: string }, IGetFilesResponse];
  'pri(google.get.file)': [GoogleFileId, KeyringPair$Json];
  'pri(google.create.file)': [ICreateFile, FilesResponse];
  'pri(google.delete.file)': [GoogleFileId, void];
  'pri(tab.status)': [null, ActiveTabAuthorizeStatus];

  //Transfer, CrossChain, Sora Swap
  'pri(accounts.checkTransfer)': [RequestCheckTransfer, ResponseCheckTransfer];
  'pri(accounts.transfer)': [RequestTransfer, BasicTxResponse, BasicTxResponse];

  'pri(accounts.checkCrossChain)': [RequestCheckCrossChain, ResponseCheckCrossChain];
  'pri(accounts.crossChain)': [RequestCrossChain, BasicTxResponse, BasicTxResponse];

  'pri(accounts.checkSwap)': [RequestCheckSwap, ResponseCheckSwap];
  'pri(accounts.swap)': [RequestSwap, ResponseMakeSwap];

  'pri(accounts.soraFees)': [null, SoraFees];

  // staking
  'pri(staking.validators)': [ValidatorsRequest, FWValidatorInfoFull[]];
  'pri(staking.makeBond)': [RequestBond, BasicTxResponse];
  'pri(staking.makeBondExtra)': [RequestBondExtra, BasicTxResponse];
  'pri(staking.makeUnbond)': [RequestUnbond, BasicTxResponse];
  'pri(staking.makeRebond)': [RequestRebond, BasicTxResponse];
  'pri(staking.makeRedeem)': [RequestRedeem, BasicTxResponse];
  'pri(staking.setControllerAccount)': [RequestSetControllerAccount, BasicTxResponse];

  //ether
  'pri(balance)': [null, BalanceJson];
  'pri(balance.subscription)': [null, BalanceJson, BalanceJson];

  'pri(price.update.currency)': [string, void];
  'pri(price.subscription)': [RequestSubscribePrice, PriceJson, PriceJson];
  'pri(soraCard.token)': [null, boolean, string];

  //OnBoarding
  'pri(onboarding.isRequired)': [null, boolean];
  'pri(onboarding.get.stories)': [string, OnboardingStories];
  'pri(onboarding.seen)': [null, void];

  // public/external requests, i.e. from a page
  'pub(soraCard.token)': [string, null];
  'pub(accounts.list)': [RequestAccountList, InjectedAccount[]];
  'pub(accounts.subscribe)': [null, string, InjectedAccount[]];
  'pub(accounts.unsubscribe)': [RequestAccountUnsubscribe, boolean];
  'pub(authorize.tab)': [RequestAuthorizeTab, Promise<AuthResponse>];
  'pub(bytes.sign)': [SignerPayloadRaw, ResponseSigning];
  'pub(extrinsic.sign)': [SignerPayloadJSON, ResponseSigning];
  'pub(metadata.list)': [null, InjectedMetadataKnown[]];
  'pub(metadata.provide)': [MetadataDef, boolean];
  'pub(phishing.redirectIfDenied)': [null, boolean];
  'pub(rpc.listProviders)': [void, ResponseRpcListProviders];
  'pub(rpc.send)': [RequestRpcSend, JsonRpcResponse<unknown>];
  'pub(rpc.startProvider)': [string, ProviderMeta];
  'pub(rpc.subscribe)': [RequestRpcSubscribe, number, JsonRpcResponse<unknown>];
  'pub(rpc.subscribeConnected)': [null, boolean, boolean];
}
