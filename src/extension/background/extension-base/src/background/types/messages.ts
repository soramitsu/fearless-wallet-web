import type { NetworkJson, RequestTransactionHistoryAdd, TransactionHistoryItemType } from '@extension-base/types';
import type {
  InjectedAccount,
  MetadataDef,
  InjectedMetadataKnown,
  ProviderMeta,
} from '@polkadot/extension-inject/types';
import type { JsonRpcResponse } from '@polkadot/rpc-provider/types';
import type { KeyringAddress } from '@polkadot/ui-keyring/types';
import type {
  RequestAccountCreateExternal,
  RequestAccountCreateSuri,
  RequestAddressCreate,
  RequestAddressRemove,
  RequestAccountMeta,
  ResponseAccountMeta,
  RequestAccountExport,
  ResponseAccountExport,
  RequestAccountBatchExport,
  ResponseAccountsExport,
  RequestAccountForget,
  RequestAccountList,
  RequestAccountShow,
  RequestAccountTie,
  RequestAccountName,
  RequestAccountSubscribe,
  AccountJson,
  RequestAccountValidate,
  RequestAccountChangePassword,
  ValidateNetworkRequest,
  ValidateNetworkResponse,
  RequestAuthorizeApprove,
  ResponseAuthorizeList,
  RequestAuthorizeSubscribe,
  AuthorizeRequest,
  RequestUpdateAuthorizedAccounts,
  RequestActiveTabsUrlUpdate,
  RequestDeriveCreate,
  RequestDeriveValidate,
  ResponseDeriveValidate,
  RequestJsonRestore,
  RequestJsonValidate,
  ValidateJsonResult,
  RequestBatchRestore,
  ResponseJsonGetAccountInfo,
  RequestMetadataApprove,
  RequestMetadataReject,
  RequestMetadataSubscribe,
  MetadataRequest,
  RequestSeedCreate,
  ResponseSeedCreate,
  RequestSeedValidate,
  ResponseSeedValidate,
  RequestSigningApprovePassword,
  RequestSigningApproveSignature,
  RequestSigningCancel,
  RequestSigningIsLocked,
  ResponseSigningIsLocked,
  RequestSigningSubscribe,
  SigningRequest,
  AllowedPath,
  RequestSaveTimeoutCache,
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
  RequestPrice,
  PriceJson,
  RequestSubscribePrice,
  RequestAccountUnsubscribe,
  RequestAuthorizeTab,
  AuthResponse,
  ResponseSigning,
  ResponseRpcListProviders,
  RequestRpcSend,
  RequestRpcSubscribe,
  RequestRpcUnsubscribe,
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
} from '@/interfaces';

// [MessageType]: [RequestType, ResponseType, SubscriptionMessageType?]
export interface RequestSignatures {
  // private/internal requests, i.e. from a popup
  //Account Managment
  'pri(accounts.create.external)': [RequestAccountCreateExternal, boolean];
  'pri(accounts.validate.path)': [DerivationPath, boolean];
  'pri(accounts.create.suri)': [RequestAccountCreateSuri, string];
  'pri(accounts.create.mobile)': [RequestAddressCreate, boolean];
  'pri(addresses.create)': [RequestAddressCreate, boolean];
  'pri(addresses.remove)': [RequestAddressRemove, boolean];
  'pri(addresses.get)': [null, KeyringAddress[]];
  'pri(accounts.get.meta)': [RequestAccountMeta, ResponseAccountMeta];
  'pri(accounts.update.meta)': [RequestUpdateMeta, boolean];
  'pri(accounts.export)': [RequestAccountExport, ResponseAccountExport];
  'pri(accounts.batchExport)': [RequestAccountBatchExport, ResponseAccountsExport];
  'pri(accounts.forget)': [RequestAccountForget, boolean];
  'pri(accounts.list)': [RequestAccountList, InjectedAccount[]];
  'pri(accounts.show)': [RequestAccountShow, boolean];
  'pri(accounts.tie)': [RequestAccountTie, boolean];
  'pri(accounts.name)': [RequestAccountName, boolean];
  'pri(accounts.subscribe)': [RequestAccountSubscribe, boolean, AccountJson[]];
  'pri(addresses.subscribe)': [RequestAccountSubscribe, boolean, AccountJson[]];
  'pri(accounts.triggerSubscription)': [null, boolean];
  'pri(accounts.validate)': [RequestAccountValidate, boolean];
  'pri(accounts.changePassword)': [RequestAccountChangePassword, boolean];
  'pri(accounts.update.current)': [string, boolean];
  'pri(accounts.update.currentNetwork)': [string, boolean];
  'pri(accounts.get.totalBalances)': [null, ResponseTotalBalances[]];

  //App Managment - networks
  // Network, APIs, Custom tokens functions
  'pri(app.port.ping)': [null, boolean];
  'pri(apiMap.validate)': [ValidateNetworkRequest, ValidateNetworkResponse];
  'pri(networkMap.upsert)': [NetworkJson, boolean];
  'pri(networkMap.getNetworkMap)': [null, Record<string, NetworkJson>];
  'pri(networkMap.getSubscription)': [null, Record<string, NetworkJson>, Record<string, NetworkJson>];
  'pri(networkMap.toggle.favorite)': [string, void];
  'pri(networkMap.setNetwork)': [string, void];

  //Authorize
  'pri(authorize.approve.polkaswap)': [string[], null];
  'pri(authorize.approve)': [RequestAuthorizeApprove, boolean];
  'pri(authorize.list)': [null, ResponseAuthorizeList];
  'pri(authorize.requests)': [RequestAuthorizeSubscribe, boolean, AuthorizeRequest[]];
  'pri(authorize.remove)': [string, ResponseAuthorizeList];
  'pri(authorize.delete.request)': [string, void];
  'pri(authorize.cancel)': [string, boolean];
  'pri(authorize.update)': [RequestUpdateAuthorizedAccounts, void];
  'pri(activeTabsUrl.update)': [RequestActiveTabsUrlUpdate, void];
  'pri(derivation.create)': [RequestDeriveCreate, boolean];
  'pri(derivation.validate)': [RequestDeriveValidate, ResponseDeriveValidate];
  'pri(json.restore)': [RequestJsonRestore, string];
  'pri(json.valid)': [RequestJsonValidate, ValidateJsonResult];
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
  'pri(mobileSigning.approve.signature)': [RequestSigningApproveSignature, boolean];
  'pri(signing.cancel)': [RequestSigningCancel, boolean];
  'pri(mobileSigning.cancel)': [RequestSigningCancel, boolean];
  'pri(signing.isLocked)': [RequestSigningIsLocked, ResponseSigningIsLocked];
  'pri(signing.requests)': [RequestSigningSubscribe, boolean, SigningRequest[]];
  'pri(mobileSigning.tx)': [RequestSigningSubscribe, boolean, MobileSigningRequest[]];

  'pri(window.open)': [AllowedPath, boolean];
  'pri(signing.refreshPasswordTimeout)': [string, number];
  'pri(signing.saveTimeoutCache)': [RequestSaveTimeoutCache, boolean];
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
  'pri(accounts.crossChain)': [RequestCrossChain, BasicTxResponse, BasicTxResponse]; // TODO
  'pri(accounts.checkSwap)': [RequestCheckSwap, ResponseCheckSwap];
  'pri(accounts.swap)': [RequestSwap, ResponseMakeSwap];
  'pri(accounts.get.soraFees)': [null, SoraFees];

  //ether
  'pri(balance.get.balance)': [null, BalanceJson];
  'pri(balance.get.subscription)': [null, BalanceJson, BalanceJson];
  'pri(transaction.history.get.subscription)': [
    null,
    Record<string, TransactionHistoryItemType[]>,
    Record<string, TransactionHistoryItemType[]>
  ];
  'pri(transaction.history.add)': [RequestTransactionHistoryAdd, boolean, TransactionHistoryItemType[]];
  'pri(price.update.currency)': [string, void];
  'pri(price.get.price)': [RequestPrice, PriceJson];
  'pri(price.get.subscription)': [RequestSubscribePrice, PriceJson, PriceJson];
  'pri(soraCard.token)': [RequestAuthorizeSubscribe, boolean, string];

  // public/external requests, i.e. from a page
  'pub(soraCard.token)': [string, null];
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
  'pub(rpc.send)': [RequestRpcSend, JsonRpcResponse<unknown>];
  'pub(rpc.startProvider)': [string, ProviderMeta];
  'pub(rpc.subscribe)': [RequestRpcSubscribe, number, JsonRpcResponse<unknown>];
  'pub(rpc.subscribeConnected)': [null, boolean, boolean];
  'pub(rpc.unsubscribe)': [RequestRpcUnsubscribe, boolean];
}
