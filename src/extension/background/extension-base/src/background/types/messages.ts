import { type KeyringAddress } from '@subwallet/ui-keyring/types';
import type { EvmRequests } from '@extension-base/services/request-service/types';
import type { AccountLiquidity } from '@sora-substrate/util/build/poolXyk/types';
import type { RequestArguments } from '@json-rpc-tools/utils';
import type {
  RequestEvmEvents,
  EvmEvent,
  ResponseEvmProviderSend,
  RequestEvmProviderSend,
} from '@extension-base/page/types';
import type {
  PoolsParamsRequest,
  PoolsParamsResponse,
  MakePoolsRequest,
  GetShareOfPoolResponse,
  GetShareOfPoolRequest,
  DefaultParams as DefaultPoolParams,
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
  // RequestApproveWalletConnectNotSupport,
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
  RequestBond,
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
  RequestSigningApprove,
  RequestSigningApproveSignature,
  RequestSigningCancel,
  GoogleFileId,
  ActiveTabAuthorizeStatus,
  RequestCheckTransfer,
  RequestCheckCrossChain,
  ResponseCheckCrossChain,
  BalanceJson,
  PriceJson,
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
  FetchBalancePayload,
  RequestCheckScam,
  ResponseCheckScam,
  RequestExportSeed,
  ResponseExportSeed,
  RequestChangePassword,
  RequestUnlockExtension,
  RequestMigratePassword,
  RequestGenerateMnemonic,
  RequestValidateMnemonic,
  RequestUpdateCurrentAccount,
  ResponseBalanceRequest,
  RequestGetHistory,
} from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type {
  InjectedAccount,
  MetadataDef,
  InjectedMetadataKnown,
  ProviderMeta,
} from '@polkadot/extension-inject/types';
import type { JsonRpcResponse } from '@polkadot/rpc-provider/types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type {
  DerivationPath,
  GoogleAuthTypes,
  VerifyTokenResponse,
  IGetFilesResponse,
  ICreateFile,
  FilesResponse,
  SoraFees,
  OnboardingStories,
  FiatJson,
  TonEventTokens,
} from '@/interfaces';

export interface RequestSignatures {
  // Keyring state
  'pri(keyring.hasMasterPassword)': [null, boolean];
  'pri(keyring.hasAccounts)': [null, boolean];
  'pri(keyring.keyringIsLocked)': [null, boolean];
  'pri(keyring.changePassword)': [RequestChangePassword, boolean];
  'pri(keyring.unlock)': [RequestUnlockExtension, boolean];
  'pri(keyring.lock)': [boolean, boolean];
  'pri(keyring.getPassword)': [null, string];
  'pri(keyring.reset)': [null, boolean];
  'pri(keyring.getMigrationAccounts)': [null, KeyringAddress[]];
  'pri(keyring.isNeedMigration)': [null, boolean];
  'pri(keyring.migrateMasterPassword)': [RequestMigratePassword, boolean];

  // Account Management
  'pri(accounts.validate.path)': [DerivationPath, boolean];
  'pri(accounts.create)': [RequestAccountCreateSuri, string];
  'pri(accounts.create.mobile)': [RequestAddressCreate, boolean];
  'pri(addresses.create)': [RequestAddressCreate, boolean];
  'pri(accounts.update.meta)': [RequestUpdateMeta, boolean];
  'pri(accounts.export.json)': [RequestAccountExport, ResponseAccountExport];
  'pri(migrate.export.json)': [string, ResponseAccountExport];
  'pri(keyring.export.mnemonic)': [RequestExportSeed, ResponseExportSeed];
  'pri(keyring.export.rowSeed)': [RequestExportSeed, ResponseExportSeed];
  'pri(keyring.generateMnemonic)': [RequestGenerateMnemonic, string];
  'pri(keyring.mnemonicValidate)': [RequestValidateMnemonic, boolean];
  'pri(accounts.forget)': [RequestAccountForget, boolean];
  'pri(accounts.list)': [null, InjectedAccount[]];
  'pri(accounts.name)': [RequestAccountName, boolean];
  'pri(accounts.subscribe)': [null, AccountJson[], AccountJson[]];
  'pri(accounts.validate)': [RequestAccountValidate, boolean];
  'pri(accounts.update.current)': [RequestUpdateCurrentAccount, boolean];
  'pri(accounts.update.currentNetwork)': [string, boolean];
  'pri(accounts.totalBalances)': [null, ResponseTotalBalances[]];
  'pri(accounts.getHistory)': [RequestGetHistory, TonEventTokens];

  // App Management - networks
  // Network, APIs, Custom tokens functions
  'pri(app.port.ping)': [null, boolean];
  'pri(networkMap.upsert)': [NetworkJson, void];
  'pri(networkMap.getSubscription)': [null, Record<string, NetworkJson>, Record<string, NetworkJson>];
  'pri(selectedNetworks.getSubscription)': [null, string, string];
  'pri(networkMap.toggle.favorite)': [string, void];

  // Authorize
  'pri(authorize.approve)': [RequestAuthorizeApprove, boolean];
  'pri(authorize.list)': [null, ResponseAuthorizeList];
  'pri(authorize.requests)': [null, AuthorizeRequest[], AuthorizeRequest[]];
  'pri(authorize.remove)': [string, ResponseAuthorizeList];
  'pri(authorize.delete.request)': [string, void];
  'pri(authorize.cancel)': [string, boolean];
  'pri(authorize.update)': [RequestUpdateAuthorizedAccounts, void];
  'pri(tabs.update.activeTabsUrl)': [RequestActiveTabsUrlUpdate, void];
  'pri(accounts.json.restore)': [RequestJsonRestore, string];
  'pri(accounts.json.valid)': [RequestJsonValidate, ValidateJsonResult];
  'pri(metadata.approve)': [RequestMetadataApprove, boolean];
  'pri(metadata.reject)': [RequestMetadataReject, boolean];
  'pri(metadata.requests)': [null, MetadataRequest[], MetadataRequest[]];
  'pri(signing.approve)': [RequestSigningApprove, boolean];
  'pri(signing.approve.signature)': [RequestSigningApproveSignature, boolean];
  'pri(signing.cancel)': [RequestSigningCancel, boolean];
  'pri(signing.requests)': [null, SigningRequest[], SigningRequest[]];

  'pri(window.open)': [string, boolean];
  'pri(google.auth)': [GoogleAuthTypes, void];
  'pri(google.verify.token)': [{ token: string }, VerifyTokenResponse | null];
  'pri(google.get.files)': [{ token: string }, IGetFilesResponse];
  'pri(google.get.file)': [GoogleFileId, KeyringPair$Json];
  'pri(google.create.file)': [ICreateFile, FilesResponse];
  'pri(google.delete.file)': [GoogleFileId, void];
  'pri(tab.status)': [null, ActiveTabAuthorizeStatus];

  // Transfer, CrossChain, Sora Swap
  'pri(accounts.checkTransfer)': [RequestCheckTransfer, ResponseCheckTransfer];
  'pri(accounts.makeTransfer)': [RequestTransfer, BasicTxResponse, BasicTxResponse];

  'pri(accounts.checkCrossChain)': [RequestCheckCrossChain, ResponseCheckCrossChain];
  'pri(accounts.makeCrossChain)': [RequestCrossChain, BasicTxResponse, BasicTxResponse];

  'pri(accounts.checkSwap)': [RequestCheckSwap, ResponseCheckSwap];
  'pri(accounts.makeSwap)': [RequestSwap, ResponseMakeSwap];

  'pri(accounts.soraFees.subscribe)': [null, SoraFees, SoraFees];
  'pri(accounts.checkScamAddress)': [RequestCheckScam, ResponseCheckScam];

  // Staking
  'pri(staking.stakingParams)': [StakingParamsRequest, StakingParamsResponse];
  'pri(staking.checkController)': [CheckControllerRequest, boolean];
  'pri(staking.rewards)': [getRewardsRequest, RewardsResponse];
  'pri(staking.myStaking)': [StakingNetworkRequest, MyStakingInfoResponse];
  'pri(staking.makeStaking)': [MakeStakingRequest, BasicTxResponse];
  'pri(staking.getPayoutsFee)': [GetPayoutsFeeRequest, string];
  'pri(staking.getNominateNetworkFee)': [GetNominateNetworkFeeRequest, string];
  'pri(staking.getBondAndNominateNetworkFee)': [RequestBond, string];

  // Pools
  'pri(pools.poolsParams)': [PoolsParamsRequest, PoolsParamsResponse];
  'pri(pools.makePool)': [MakePoolsRequest, BasicTxResponse];
  'pri(pools.shareOfPool)': [GetShareOfPoolRequest, GetShareOfPoolResponse];
  'pri(pools.unsubscribePools)': [null, void];
  'pri(pools.accountLiquidity)': [null, boolean, AccountLiquidity[]];
  'pri(pools.getAmountValue)': [DefaultPoolParams, string];

  // Ether
  'pri(balance)': [null, BalanceJson];
  'pri(fetch.evm.balance)': [FetchBalancePayload, void];
  'pri(balance.subscription)': [null, BalanceJson, BalanceJson];
  'pri(fetch.balance)': [FetchBalanceRequest, ResponseBalanceRequest[]];
  'pri(signing.evmRequests)': [null, EvmRequests, EvmRequests];

  // price
  'pri(price.update.currency)': [string, void];
  'pri(price.subscription)': [null, PriceJson, PriceJson];
  'pri(price.getFiats)': [null, FiatJson[]];

  // Evm
  'evm(events.subscribe)': [RequestEvmEvents, boolean, EvmEvent];
  'evm(request)': [RequestArguments, unknown];
  'evm(provider.send)': [RequestEvmProviderSend, string | number, ResponseEvmProviderSend];

  // OnBoarding
  'pri(onboarding.isRequired)': [null, boolean];
  'pri(onboarding.getStories)': [string, OnboardingStories];
  'pri(onboarding.setComplete)': [null, void];

  // Public/external requests, i.e. from a page
  'pub(accounts.list)': [null, InjectedAccount[]];
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

  // Wallet Connect
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
  // 'pri(walletConnect.notSupport.approve)': [RequestApproveWalletConnectNotSupport, boolean];
  'pri(walletConnect.notSupport.reject)': [RequestRejectWalletConnectNotSupport, boolean];

  'pri(walletConnect.signing.requests.subscribe)': [
    RequestSigningSubscribe,
    WalletConnectTransactionRequest[],
    WalletConnectTransactionRequest[]
  ];
  'pri(walletConnect.request.approve)': [RequestApproveWalletConnect, boolean];
  'pri(walletConnect.request.reject)': [{ topic: string }, boolean];

  // Wallet Connect dApp
  'pri(walletConnect.app.connect)': [null, string];
  'pri(walletConnect.app.disconnect)': [null, string];
  'pri(walletConnect.app.subscribePairing)': [string, PairingSubjectType, PairingSubjectType];
  'pri(walletConnect.app.pairing)': [null, string];

  // Nfts
  'pri(nft.get.all)': [string, OwnedNftsResponse];
  'pri(nft.subscribe)': [null, ChainNftState, ChainNftState];
  'pri(nft.fetch)': [string, void];
  'pri(nft.send)': [NftTx, ResponseNftTransfer];
  'pri(nft.fetchNftsForContract)': [AvailableNftPayload, AvailableNftResponse];
  'pri(nft.checkSend)': [NftTx, CheckNftResponse];
  'pri(nft.settings)': [RequestSettingsChangePayload, void];
}
