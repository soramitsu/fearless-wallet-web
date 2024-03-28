import {
  type MyPoolsRequest,
  type MyPoolsInfoResponse,
  type PoolsParamsRequest,
  type PoolsParamsResponse,
  MakePoolsRequest,
} from '@extension-base/services/pools-service/types';
import type {
  NftTx,
  CheckNftResponse,
  AvailableNftPayload,
  AvailableNftResponse,
  RequestSettingsChangePayload,
  ChainNftState,
} from '@extension-base/services/nft-service/types';
import type { OwnedNftsResponse } from 'alchemy-sdk';
import type {
  PairingSubjectType,
  RequestApproveConnectWalletSession,
  RequestApproveWalletConnect,
  RequestApproveWalletConnectNotSupport,
  RequestConnectWalletConnect,
  RequestDisconnectWalletConnectSession,
  RequestReconnectConnectWalletSession,
  RequestRejectConnectWalletSession,
  RequestRejectWalletConnectNotSupport,
  WalletConnectNotSupportRequest,
  WalletConnectSessionRequest,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import type {
  StakingParamsRequest,
  StakingParamsResponse,
  MyStakingInfoResponse,
  MakeStakingRequest,
  RewardsResponse,
  CheckControllerRequest,
  getRewardsRequest,
  StakingNetworkRequest,
  GetPayoutsFeeRequest,
  GetNominateNetworkFeeRequest,
} from '@extension-base/services/staking-service/types';
import type { SignerPayloadRaw, SignerPayloadJSON } from '@polkadot/types/types';
import type { SessionTypes } from '@walletconnect/types';
import type {
  BasicTxResponse,
  NotificationResponse,
  RequestCrossChain,
  RequestSwap,
  RequestTransfer,
  ResponseCheckTransfer,
  SigningRequest,
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
  AllowedPath,
  GoogleFileId,
  ActiveTabAuthorizeStatus,
  RequestCheckTransfer,
  RequestCheckCrossChain,
  ResponseCheckCrossChain,
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
  ResponseMakeSwap,
  RequestUpdateMeta,
  ResponseTotalBalances,
  RequestSigningSubscribe,
  FetchBalanceRequest,
  ResponseNftTransfer,
  FetchEvmBalancePayload,
} from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type {
  InjectedAccount,
  MetadataDef,
  InjectedMetadataKnown,
  ProviderMeta,
} from '@polkadot/extension-inject/types';
import type { JsonRpcResponse } from '@polkadot/rpc-provider/types';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type {
  DerivationPath,
  GoogleAuthTypes,
  VerifyTokenResponse,
  IGetFilesResponse,
  ICreateFile,
  FilesResponse,
  SoraFees,
  OnboardingStories,
} from '@/interfaces';

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
  'pri(staking.stakingParams)': [StakingParamsRequest, StakingParamsResponse];
  'pri(staking.checkController)': [CheckControllerRequest, boolean];
  'pri(staking.rewards)': [getRewardsRequest, RewardsResponse];
  'pri(staking.myStaking)': [StakingNetworkRequest, MyStakingInfoResponse];
  'pri(staking.makeStaking)': [MakeStakingRequest, BasicTxResponse];
  'pri(staking.getPayoutsFee)': [GetPayoutsFeeRequest, string];
  'pri(staking.getNominateNetworkFee)': [GetNominateNetworkFeeRequest, string];

  // pools
  'pri(pools.poolsParams)': [PoolsParamsRequest, PoolsParamsResponse];
  'pri(pools.myPools)': [MyPoolsRequest, MyPoolsInfoResponse];
  'pri(pools.makePool)': [MakePoolsRequest, BasicTxResponse];

  //ether
  'pri(balance)': [null, BalanceJson];
  'pri(fetch.evm.balance)': [FetchEvmBalancePayload, void];
  'pri(balance.subscription)': [null, BalanceJson, BalanceJson];
  'pri(fetch.balance)': [FetchBalanceRequest, string];

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

  //Wallet Connect
  'pri(walletConnect.connect)': [RequestConnectWalletConnect, boolean];
  'pri(walletConnect.requests.connect.subscribe)': [null, WalletConnectSessionRequest[], WalletConnectSessionRequest[]];
  'pri(walletConnect.session.approve)': [RequestApproveConnectWalletSession, NotificationResponse];
  'pri(walletConnect.session.reject)': [RequestRejectConnectWalletSession, boolean];
  'pri(walletConnect.session.reconnect)': [RequestReconnectConnectWalletSession, boolean];
  'pri(walletConnect.session.subscribe)': [null, SessionTypes.Struct[], SessionTypes.Struct[]];
  'pri(walletConnect.session.disconnect)': [RequestDisconnectWalletConnectSession, boolean];
  'pri(walletConnect.requests.notSupport.subscribe)': [
    null,
    WalletConnectNotSupportRequest[],
    WalletConnectNotSupportRequest[]
  ];
  'pri(walletConnect.notSupport.approve)': [RequestApproveWalletConnectNotSupport, boolean];
  'pri(walletConnect.notSupport.reject)': [RequestRejectWalletConnectNotSupport, boolean];

  'pri(walletConnect.signing.requests.subscribe)': [
    RequestSigningSubscribe,
    WalletConnectTransactionRequest[],
    WalletConnectTransactionRequest[]
  ];
  'pri(walletConnect.request.approve)': [RequestApproveWalletConnect, boolean];
  'pri(walletConnect.request.reject)': [{ topic: string }, boolean];
  //Wallet Connect dApp
  'pri(walletConnect.app.connect)': [null, string];
  'pri(walletConnect.app.disconnect)': [null, string];
  'pri(walletConnect.app.subscribePairing)': [string, PairingSubjectType, PairingSubjectType];
  'pri(walletConnect.app.pairing)': [null, string];

  //Nfts
  'pri(nft.get.all)': [string, OwnedNftsResponse];
  'pri(nft.subscribe)': [null, ChainNftState, ChainNftState];
  'pri(nft.fetch)': [string, void];
  'pri(nft.send)': [NftTx, ResponseNftTransfer];
  'pri(nft.fetchNftsForContract)': [AvailableNftPayload, AvailableNftResponse];
  'pri(nft.checkSend)': [NftTx, CheckNftResponse];
  'pri(nft.settings)': [RequestSettingsChangePayload, void];
}
