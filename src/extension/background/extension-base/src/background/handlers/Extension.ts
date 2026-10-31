import WalletRecoveryRecords from '@extension-base/stores/WalletRecoveryRecords';
import { walletAddressIdentity } from '@extension-base/services/keyring-service/DeletedWallets';
import { validatePolkadotSigningContext } from '@extension-base/services/wallet-connect-service/polkadotSigningContext';
import { chrome } from '@extension-base/utils/crossenv';
import { checkIfDenied } from '@polkadot/phishing';
import { assert } from '@polkadot/util';
import { isEthereumAddress } from '@polkadot/util-crypto';
import {
  assertSubstrateSigningPair,
  validateSubstrateSigningAccount,
} from '@extension-base/services/request-service/handlers/substrateSigningAccount';
import { ethers, formatUnits, VoidSigner, Wallet } from 'ethers';
import { makeEVMTransfer, quoteEVMTransfer, sendDappEvmTransaction } from '@extension-base/api/evm/transfer';
import {
  isBitcoinTransferNetwork,
  makeBitcoinTransfer,
  quoteBitcoinTransfer,
} from '@extension-base/api/bitcoin/transfer';
import {
  estimateIrohaTransferFee,
  isIrohaTransferNetwork,
  makeIrohaTransfer,
} from '@extension-base/api/iroha/transfer';
import {
  getIrohaTransferFrameBytes,
  requireProductionIrohaTransferCodec,
} from '@extension-base/api/iroha/productionTransferCodec';
import {
  isSolanaTransferNetwork,
  makeSolanaTransfer,
  quoteSolanaTransfer,
  SolanaTransactionStatusUnknownError,
} from '@extension-base/api/solana/transfer';
import { estimateFee, makeTransfer } from '@extension-base/api/substrate/transfer';
import { createSwap, prepareSwapExecution } from '@extension-base/api/substrate/sora';
import FWExtensionBase from '@extension-base/background/handlers/ExtensionBase';
import { getInternalError } from '@walletconnect/utils';
import {
  makeCrossChain,
  estimateCrossChainQuote,
  refreshCrossChainOriginBalance,
  assertCrossChainSignerCapability,
  assertCrossChainSendAvailable,
} from '@extension-base/api/substrate/crossChain';
import {
  isProposalExpired,
  isSupportWalletConnectNamespace,
  isSupportWalletConnectChain,
} from '@extension-base/services/wallet-connect-service/utils';
import { BasicTxErrorCode, TransferErrorCode } from '@extension-base/background/types/types';
import {
  type RequestConnectWalletConnect,
  type WalletConnectSessionRequest,
  type RequestApproveConnectWalletSession,
  type ResultApproveWalletConnectSession,
  type RequestRejectConnectWalletSession,
  type RequestDisconnectWalletConnectSession,
  type WalletConnectTransactionRequest,
  type RequestApproveWalletConnect,
  type RequestRejectWalletConnect,
  type WalletConnectNotSupportRequest,
  // type RequestApproveWalletConnectNotSupport,
  type RequestRejectWalletConnectNotSupport,
  EIP155_SIGNING_METHODS,
} from '@extension-base/services/wallet-connect-service/types';
import {
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
  WALLET_CONNECT_SUPPORTED_METHODS,
} from '@extension-base/services/wallet-connect-service/consts';
import {
  resolveSolanaSignAndSendTransaction,
  resolveSolanaSigning,
} from '@extension-base/services/request-service/handlers/solanaSigning';
import { siteApprovalsInProgress } from '@extension-base/services/request-service/siteApprovals';
import { createClusterBoundSolanaRpcClient } from '@extension-base/services/solana-rpc-service';
import { assertSendCapability } from '@extension-base/services/send-kill-switch-service';
import { IrohaTransactionStatusUnknownError } from '@extension-base/services/iroha-torii-service';
import { validateWalletConnectSigningContext } from '@extension-base/services/wallet-connect-service/signingContext';
import { validateEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';
import {
  assertMobileTransactionResult,
  captureMobileTransactionIntent,
} from '@extension-base/services/wallet-connect-service/mobileTransaction';
import {
  createSubstrateSigningRegistry,
  validateSubstrateSigningContext,
} from '@extension-base/services/request-service/handlers/substrateSigningContext';
import { CrossChainDestinationRetiredError } from '@extension-base/services/request-service/handlers/substrateCallReview';
import {
  assertEvmExternalSignature,
  assertSubstrateExternalSignature,
} from '@extension-base/services/request-service/handlers/externalSignature';
import { filterNetworksByEcosystem } from '@extension-base/background/helpers/balance';
import { pickDefaultCurrentAccount, toCurrentAccountInfo } from '@extension-base/background/helpers/currentAccount';
import { PolkamarktService } from '@extension-base/services/polkamarkt-service';
import { createPolkamarktFinalAuthorizationGuard } from '@extension-base/services/polkamarkt-service/finalAuthorization';
import {
  requireEnabledIrohaConnect,
  subscribeIrohaConnectState,
} from '@extension-base/services/iroha-connect-service/releaseGate';
import { type MakeCrossChainProps } from '../../api/substrate/types';
import { EXTENSION_URL } from '../../const';
import { makeTonTransfer, maxTonTransferFee } from '../../api/ton/transfer';
import type { NetworkMapEdit } from '@extension-base/services/network-service/preferences';
import type { SigningRequestKind } from '@extension-base/services/request-service/signingRequestId';
import type {
  IrohaConnectAccountRequest,
  IrohaConnectPendingRequest,
  IrohaConnectSnapshot,
  IrohaConnectStartRequest,
} from '@extension-base/services/iroha-connect-service/types';
import type {
  EvmRequests,
  EvmRequestsSubjectPayload,
  SolanaRequests,
  SolanaRequestsSubjectPayload,
} from '@extension-base/services/request-service/types';
import type {
  AccountAuthType,
  RequestUpdateMeta,
  PriceJson,
  NotificationResponse,
  ResponseCheckTransfer,
  SigningRequest,
  ActiveTabAuthorizeStatus,
  BalanceJson,
  BasicTxError,
  Port,
  RequestCheckSwap,
  RequestCheckTransfer,
  RequestCheckCrossChain,
  RequestSwap,
  RequestTransfer,
  RequestCrossChain,
  ResponseCheckSwap,
  ResponseCheckCrossChain,
  ResponseMakeSwap,
  AccountJson,
  SignRequest,
  AuthorizeRequest,
  GoogleFileId,
  MessageTypes,
  MetadataRequest,
  RequestAccountCreateSuri,
  RequestAccountExport,
  RequestAccountForget,
  RequestRestoreDeletedWallet,
  ResponseRestoreDeletedWallet,
  RequestAccountName,
  RequestAccountValidate,
  RequestActiveTabsUrlUpdate,
  RequestAddressCreate,
  RequestAuthorizeApprove,
  RequestJsonRestore,
  RequestMetadataApprove,
  RequestMetadataReject,
  RequestSigningApprove,
  RequestSigningApproveSignature,
  RequestSigningCancel,
  RequestTypes,
  RequestUpdateAuthorizedAccounts,
  ResponseAuthorizeList,
  ResponseType,
  BasicTxResponse,
  FetchBalanceRequest,
  RequestNftTransfer,
  FetchBalancePayload,
  RequestCheckScam,
  AuthUrls,
  RequestExportSeed,
  RequestChangePassword,
  RequestUnlockExtension,
  RequestMigratePassword,
  RequestRecoverAccountWithPassword,
  RequestRecoverAccountWithPhrase,
  RequestGenerateMnemonic,
  RequestValidateMnemonic,
  RequestTonImportCandidates,
  TonImportCandidateInfo,
  RequestUpdateCurrentAccount,
  ResponseBalanceRequest,
  RequestGetHistory,
  RequestTotalBalances,
  RequestPortfolioHoldings,
} from '@extension-base/background/types/types';
import type {
  PoolsParamsRequest,
  MakePoolsRequest,
  GetShareOfPoolRequest,
  DefaultParams as DefaultPoolParams,
  DemeterMutationRequest,
} from '@extension-base/services/pools-service/types';
import type {
  StakingNetworkRequest,
  StakingParamsRequest,
  MyStakingInfoResponse,
  CheckControllerRequest,
  getRewardsRequest,
  MakeStakingRequest,
  GetPayoutsFeeRequest,
  GetNominateNetworkFeeRequest,
  RequestBond,
} from '@extension-base/services/staking-service/types';
import type {
  RequestSettingsChangePayload,
  AvailableNftPayload,
  NftTx,
} from '@extension-base/services/nft-service/types';
import type { RequestUpdateLegacyExposure } from '@extension-base/services/legacy-exposure-service';
import type { NetworkJson } from '@extension-base/types';
import type State from '@extension-base/background/handlers/State';
import type { ProposalTypes, SessionTypes } from '@walletconnect/types';
import type { HexString } from '@polkadot/util/types';
import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import type { PolkamarktMutationRequest, PolkamarktQuoteRequest } from '@/defi/polkamarkt/types';
import type { DerivationPath, GoogleAuthTypes, ICreateFile, RequestGoogleToken } from '@/interfaces';
import { api as apiSora, FPNumber, Operation } from '@/sora';
import { soraSubmissionUnknownResponse } from '@/sora/submission';
import { crossChainQuoteTokens } from '@/cross-chain/quoteTokens';
import { CrossChainPreviousSendUnresolvedError } from '@/cross-chain/sendLedger';
import { BitcoinTransactionStatusUnknownError } from '@/util/bitcoinSend';
import { evmMessageBytes } from '@/util/evmMessageBytes';
import { evmTransaction } from '@/util/evmTransaction';
import { evmTypedData } from '@/util/evmTypedData';
import { isCapturedSoraPairStillSelected, isLocallySignableSelectedSoraPair } from '@/defi/soraAccountBinding';
import { WalletEcosystem } from '@/interfaces';
import { getTabAuthorizationTarget, withErrorLog } from '@/extension/background/extension-base/src/background/helpers';
import {
  isNativeEVMNetwork,
  uniqueStringArray,
  getBalanceItem,
} from '@/extension/background/extension-base/src/background/handlers/utils';
import { LIQUID_SOURCE_FOR_MARKET } from '@/consts/currencies';
import { IS_EXTENSION, IS_EXTENSION_SMOKE } from '@/consts/global';
import { assertWalletAllowsConnection } from '@/util/walletRecoveryPolicy';
import {
  assertWalletAllowsRecoveryAction, isRecoveryStakingAction, isRecoveryPoolAction,
  isRecoveryDemeterAction, isRecoveryPolkamarktAction,
} from '@/util/walletRecoveryActions';
import { ALL_NETWORKS } from '@/consts/networks';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { XOR } from '@/sora/runtime';
import { validateReviewedCrossChainRequest, type ValidatedCrossChainRoute } from '@/cross-chain/requestValidation';
import { validateAuthoritativePolkaswapExecution, validatePolkaswapExecution } from '@/defi/polkaswapExecutionGuard';
import { isSameString, isTonNetwork } from '@/helpers';
import { deriveTonImportCandidates } from '@/util/tonKeyring';

function isEvmSignRequest(
  value: SignRequest | EvmRequestsSubjectPayload | SolanaRequestsSubjectPayload
): value is EvmRequestsSubjectPayload {
  return 'data' in value;
}

function isSolanaSignRequest(
  value: SignRequest | EvmRequestsSubjectPayload | SolanaRequestsSubjectPayload
): value is SolanaRequestsSubjectPayload {
  return 'ecosystem' in value && value.ecosystem === 'solana';
}

// The queue a request was admitted to, by the same shapes the popup reads to show it.
function signingKindOf(value: object): SigningRequestKind {
  if ('data' in value) return 'evm';

  return 'ecosystem' in value && (value as { ecosystem?: unknown }).ecosystem === 'solana' ? 'solana' : 'substrate';
}

function formatSoraAddress(address: string): string {
  return apiSora.formatAddress(address);
}

export default class Extension extends FWExtensionBase {
  private assertConnectionAllowed(address: string, authType: AccountAuthType, url: string): void {
    if (!IS_EXTENSION) return;
    // A Substrate connection exposes only the approved public account. Existing/imported keys are shared only with
    // Polkaswap (its account migration) and retain their separate signing restrictions.
    if (authType === 'substrate') {
      assertWalletAllowsConnection([
        ...this.state.keyringService.getAllAccounts(),
        ...this.state.keyringService.tonKeyring.getAccounts(),
      ], address, url);
    } else this.assertNormalWalletUse(address);
  }

  private assertNormalWalletUse(address: string, recoveryAction = false): void {
    if (!IS_EXTENSION) return;
    assertWalletAllowsRecoveryAction([
      ...this.state.keyringService.getAllAccounts(),
      ...this.state.keyringService.tonKeyring.getAccounts(),
    ], address, recoveryAction);
  }

  private readonly pendingSiteApprovals = siteApprovalsInProgress;

  private assertSigningRequestCurrent(request: { id: string }): void {
    this.state.keyringLockService?.lockIfExpired();
    if (this.state.requestService.getSignRequest(request.id, signingKindOf(request)) !== request) {
      throw new Error('Signing request was cancelled or replaced');
    }
  }

  private assertNonEvmSigningAuthorization(request: SignRequest | SolanaRequestsSubjectPayload): void {
    this.assertSigningRequestCurrent(request);
    if (!isSolanaSignRequest(request) && request.walletConnectContext) {
      validatePolkadotSigningContext(this.state, request.walletConnectContext, request.request.payload, request.url);
    } else {
      this.state.requestService.authRequestHandler.assertSigningAuthorization(
        request.url,
        isSolanaSignRequest(request) ? 'solana' : 'substrate',
        request.account.address,
        request.authorizationRevision
      );
    }
    if (!isSolanaSignRequest(request)) {
      validateSubstrateSigningContext(this.state, request);
      validateSubstrateSigningAccount(this.state, request);
    }
  }

  private async assertSigningSiteAllowed(request: {
    id: string;
    url: string;
    reject(error: Error): void;
  }): Promise<void> {
    const denied = await checkIfDenied(request.url);
    this.assertSigningRequestCurrent(request);
    if (denied) {
      const error = new Error('Signing requester is flagged as phishing');
      request.reject(error);
      throw error;
    }
  }

  constructor(state: State) {
    super(state);
  }

  private cancelSubscription(id: string): boolean {
    return this.state.subscriptionService.cancelSubscription(id);
  }

  async accountsForget({ address, type }: RequestAccountForget): Promise<boolean> {
    const pair = this.state.keyringService.getPair(address);
    const mobileAccount = type === 'mobile' ? this.state.keyringService.getAddress(address) : undefined;
    const meta = pair?.meta ?? mobileAccount?.meta;
    const ethereumAddress = meta?.ethereumAddress as string | undefined;
    const solanaAddress = meta?.solanaAddress as string | undefined;
    const irohaAddress = meta?.irohaAddress as string | undefined;
    const topic = mobileAccount?.meta.wcTopic;
    // An EVM account that another wallet also links keeps its key, site grants and sessions.
    const linkedElsewhere = () => !!ethereumAddress &&
      this.state.keyringService.isEthereumAccountLinkedElsewhere(ethereumAddress, address);
    const keepsEthereum = linkedElsewhere();
    const removedEthereumAddress = keepsEthereum ? undefined : ethereumAddress;
    const assertCurrent = () => {
      const currentPair = this.state.keyringService.getPair(address);
      const currentMobile = type === 'mobile' ? this.state.keyringService.getAddress(address) : undefined;
      const currentMeta = currentPair?.meta ?? currentMobile?.meta;
      if (currentPair !== pair || currentMeta?.ethereumAddress !== ethereumAddress ||
        currentMeta?.solanaAddress !== solanaAddress || currentMeta?.irohaAddress !== irohaAddress ||
        currentMobile?.meta.wcTopic !== topic || linkedElsewhere() !== keepsEthereum)
        throw new Error('Wallet changed during removal. Retry with the current wallet.');
    };

    await this.state.requestService.mutateAuthorizations((authUrls) => {
      for (const auth of Object.values(authUrls)) {
        auth.authorizedAccounts = auth.authorizedAccounts.filter((candidate) => walletAddressIdentity(candidate) !== walletAddressIdentity(address));
        if (auth.evmAuthorizedAccount && ((isEthereumAddress(address) && isSameString(auth.evmAuthorizedAccount, address)) ||
          (removedEthereumAddress && isSameString(auth.evmAuthorizedAccount, removedEthereumAddress)))) auth.evmAuthorizedAccount = '';
        if (auth.solanaAuthorizedAccount === address || (solanaAddress && auth.solanaAuthorizedAccount === solanaAddress))
          auth.solanaAuthorizedAccount = '';
        if (auth.irohaAuthorizedAccount === address || (irohaAddress && auth.irohaAuthorizedAccount === irohaAddress))
          auth.irohaAuthorizedAccount = '';
      }
    });

    let clearedSelection = false;
    let clearedRevision = 0;
    const beforeRemoval = async () => {
      assertCurrent();
      const selected = this.state.currentAccount?.address;
      if (!selected || (walletAddressIdentity(selected) !== walletAddressIdentity(address) &&
        (!removedEthereumAddress || walletAddressIdentity(selected) !== walletAddressIdentity(removedEthereumAddress)))) return;
      await this.state.setCurrentAccount(null, undefined, assertCurrent);
      clearedSelection = true;
      clearedRevision = this.state.keyringService.currentAccountRevision;
    };

    if (type === 'native') {
      await this.state.walletConnectService.removeSessions(address, removedEthereumAddress);

      try { await this.state.keyringService.forgetAccount(address, beforeRemoval, assertCurrent); }
      catch (error) { console.error(error); return false; }
    } else {
      if (typeof topic === 'string') await this.state.walletConnectDappService.disconnect(topic);
      try { await this.state.keyringService.forgetAddress(address, beforeRemoval, assertCurrent); }
      catch (error) { console.error(error); return false; }
    }

    const isWasCurrentAccount = clearedSelection && !this.state.currentAccount &&
      this.state.keyringService.currentAccountRevision === clearedRevision;

    // Never leave the removed account selected: updateCurrentAccount refuses EVM addresses,
    // so a remaining standalone EVM account is stored directly, and no account means none.
    if (isWasCurrentAccount) {
      const nextAccount = pickDefaultCurrentAccount(this.state.keyringService.getAllMainAccounts());

      if (nextAccount && isEthereumAddress(nextAccount.address)) await this.state.setCurrentAccount(toCurrentAccountInfo(nextAccount));
      else if (nextAccount)
        await this.state.updateCurrentAccount({
          address: nextAccount.address,
          walletEcosystem: nextAccount.meta.walletEcosystem,
        });
    }

    this.state.cleanupDeletedAccount(address);

    return true;
  }

  // Back in the wallet list and selected, as after an import of the same wallet.
  async restoreDeletedWallet({ id }: RequestRestoreDeletedWallet): Promise<ResponseRestoreDeletedWallet> {
    const result = await this.state.keyringService.restoreDeletedWallet(id);

    if (result.ok && result.address && !isEthereumAddress(result.address)) {
      const walletEcosystem = result.walletEcosystem ?? WalletEcosystem.Substrate;

      if (walletEcosystem !== WalletEcosystem.Ton) this.state.updateNetworkForNewWallet(result.address);

      await this.state.updateCurrentAccount({ address: result.address, walletEcosystem });
    }

    return result;
  }

  async accountsCreate({ suri, type, meta, walletEcosystem, tonImport, requireFreshGeneration }: RequestAccountCreateSuri): Promise<string> {
    const address = await this.state.keyringService.addAccount(
      suri,
      { ...meta, isMobile: false },
      walletEcosystem,
      type,
      tonImport,
      requireFreshGeneration
    );

    if (!isEthereumAddress(address) && !IS_EXTENSION_SMOKE) {
      await this.state.updateCurrentAccount({ address, walletEcosystem });
    }

    return address;
  }

  // Every TON address the typed text can open. Addresses are only looked up on the network when
  // there is a choice to make; a phrase with a single address shares nothing before it is imported.
  async tonImportCandidates({ mnemonic }: RequestTonImportCandidates): Promise<TonImportCandidateInfo[]> {
    const tonAccounts = this.state.keyringService.tonKeyring.accountSubject.value;
    const candidates = (await deriveTonImportCandidates(mnemonic)).map(({ derivation, address }) => ({
      derivation,
      address,
      ...(tonAccounts[address] ? { inWallet: true } : {}),
    }));

    if (candidates.length < 2) return candidates.map((candidate) => ({ ...candidate, activity: 'unknown' }));

    const activity = await this.state.balanceService.tonBalanceService.fetchAddressActivity(
      candidates.map(({ address }) => address)
    );

    return candidates.map((candidate) => ({
      ...candidate,
      ...(activity[candidate.address] ?? { activity: 'unknown' }),
    }));
  }

  accountsValidatePassword({ password }: RequestAccountValidate): boolean {
    return this.state.keyringService.getPassword() === password;
  }

  convertAccounts(accounts: SubjectInfo, walletEcosystem = WalletEcosystem.Substrate): AccountJson[] {
    const linkedEthereumAddresses = new Set(Object.values(accounts)
      .filter(({ json: { address } }) => !isEthereumAddress(address))
      .map(({ json: { meta } }) => (meta.ethereumAddress as string | undefined)?.toLowerCase())
      .filter(Boolean));
    return Object.values(accounts).flatMap<AccountJson>(({ json: { address, meta }, type }) => {
      const isEvm = isEthereumAddress(address);
      if (isEvm && linkedEthereumAddresses.has(address.toLowerCase())) return [];

      const pair = this.state.keyringService.getPair(address);
      const haveEntropy = pair?.haveEntropy && !meta.isMnemonicUnverified;

      return {
        ethereumAddress: meta.ethereumAddress as string,
        active: address === this.state.currentAccount?.address,
        name: meta.name ?? '',
        haveEntropy,
        network: this.state.networkService.selectedNetworks[address] ?? ALL_NETWORKS,
        walletEcosystem,
        ...meta,
        // Backup metadata cannot replace the keyring identity used by selection
        // and authorization. Keep its original fields only in the stored backup.
        address,
        type,
        // Linked keys appear on their parent; independently imported EVM keys
        // retain their own selectable identity without rewriting legacy metadata.
        ...(isEvm ? { ethereumAddress: address, walletEcosystem: WalletEcosystem.Evm } : {}),
      };
    });
  }

  async accountsSubscribe(id: string, port?: Port): Promise<AccountJson[]> {
    const cb = this.state.subscriptionService.createSubscription<'pri(accounts.subscribe)'>(id, port);

    const substrateTransformedAddresses = this.convertAccounts(this.state.keyringService.addressSubject.value);
    const substrateTransformedAccounts = this.convertAccounts(this.state.keyringService.accountSubject.value);
    const tonTransformedAccounts = this.convertAccounts(this.state.keyringService.tonKeyring.accountSubject.value, WalletEcosystem.Ton);

    const substrateAddressesSubscription = this.state.keyringService.addressSubject.subscribe(
      (addresses: SubjectInfo): void => {
        cb([
          ...this.convertAccounts(addresses),
          ...this.convertAccounts(this.state.keyringService.accountSubject.value),
          ...this.convertAccounts(this.state.keyringService.tonKeyring.accountSubject.value, WalletEcosystem.Ton),
        ]);
      }
    );

    const substrateAccountsSubscription = this.state.keyringService.accountSubject.subscribe(
      (accounts: SubjectInfo): void => {
        cb([
          ...this.convertAccounts(this.state.keyringService.addressSubject.value),
          ...this.convertAccounts(accounts),
          ...this.convertAccounts(this.state.keyringService.tonKeyring.accountSubject.value, WalletEcosystem.Ton),
        ]);
      }
    );

    const tonSubscription = this.state.keyringService.tonKeyring.accountSubject.subscribe(
      (accounts: SubjectInfo): void => {
        cb([
          ...this.convertAccounts(this.state.keyringService.addressSubject.value),
          ...this.convertAccounts(this.state.keyringService.accountSubject.value),
          ...this.convertAccounts(accounts, WalletEcosystem.Ton),
        ]);
      }
    );

    // Restoring the selected account is asynchronous in the web store. Publish
    // that selection even when the account collection itself has not changed.
    const currentAccountSubscription = this.state.keyringService.currentAccountSubject.subscribe(() => {
      cb([
        ...this.convertAccounts(this.state.keyringService.addressSubject.value),
        ...this.convertAccounts(this.state.keyringService.accountSubject.value),
        ...this.convertAccounts(this.state.keyringService.tonKeyring.accountSubject.value, WalletEcosystem.Ton),
      ]);
    });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => {
      substrateAddressesSubscription.unsubscribe();
      substrateAccountsSubscription.unsubscribe();
      tonSubscription.unsubscribe();
      currentAccountSubscription.unsubscribe();
    });

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return [...substrateTransformedAddresses, ...substrateTransformedAccounts, ...tonTransformedAccounts];
  }

  async authorizeApprove({ authorizedAccounts, id }: RequestAuthorizeApprove): Promise<boolean> {
    const authRequest = this.state.requestService.getAuthRequest(id);

    assert(authRequest, 'Unable to find request');
    // Use this request's protocol, not the accumulated scopes of an older grant.
    const authType = authRequest.request.accountAuthType ?? 'substrate';
    authorizedAccounts.forEach((address) => this.assertConnectionAllowed(address, authType, authRequest.url));

    await authRequest.resolve({ authorizedAccounts });

    return true;
  }

  async authorizeUpdate({ authorizedAccounts, url, authType }: RequestUpdateAuthorizedAccounts): Promise<void> {
    authorizedAccounts.forEach((address) => this.assertConnectionAllowed(address, authType, url));
    return this.state.requestService.updateAuthorizedAccounts([[url, authorizedAccounts, authType]]);
  }

  async authList(): Promise<AuthUrls> {
    const authUrls = await this.state.requestService.getAuthList();
    const addresses = this.state.keyringService.getAllAccounts().map(({ address }) => address);
    // This is a display projection. Listing permissions must never persist a
    // whole map captured before a concurrent revoke/approval.
    for (const auth of Object.values(authUrls)) {
      auth.allowedAccountsMap = Object.fromEntries(addresses.map((address) => [address, auth.allowedAccountsMap?.[address] === true]));
    }
    return authUrls;
  }

  async getAuthList(): Promise<ResponseAuthorizeList> {
    const list = await this.authList();

    return { list };
  }

  async isTabAuthorize(): Promise<ActiveTabAuthorizeStatus> {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    const target = getTabAuthorizationTarget(tab?.url);
    if (!target) {
      return {
        isAuthorize: false,
        authorizeAccountsCount: 0,
        dAppName: '',
      };
    }

    const { hostname: tabHostName, key: tabAuthKey } = target;

    const authUrls = await this.state.requestService.getAuthList();
    const auth = authUrls[tabAuthKey];
    const isAuthorize = auth?.isAllowed === true;
    return {
      isAuthorize,
      authorizeAccountsCount: isAuthorize ? auth.authorizedAccounts?.length ?? 0 : 0,
      dAppName: tabHostName,
    };
  }

  authorizeSubscribe(id: string, port?: Port): AuthorizeRequest[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(authorize.requests)'>(id, port);

    const authSubscription = this.state.authSubject.subscribe((requests: AuthorizeRequest[]): void => cb(requests));

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => authSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.authSubject.value;
  }

  async metadataApprove({ id }: RequestMetadataApprove): Promise<boolean> {
    const queued = this.state.requestService.getMetaRequest(id);

    assert(queued, 'Unable to find request');

    const { request, resolve } = queued;

    this.state.saveMetadata(request);

    resolve(true);

    return true;
  }

  metadataReject({ id }: RequestMetadataReject): boolean {
    const queued = this.state.requestService.getMetaRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    reject(new Error('Rejected'));

    return true;
  }

  metadataSubscribe(id: string, port?: Port): MetadataRequest[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(metadata.requests)'>(id, port);

    const metaSubscription = this.state.requestService.metaSubject.subscribe((requests: MetadataRequest[]): void =>
      cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => metaSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.metaSubject.value;
  }

  async jsonRestore({ file, password, linkedEthereumAddress }: RequestJsonRestore): Promise<string> {
    const stringFile = JSON.stringify(file);
    if (ethers.isKeystoreJson(stringFile)) {
      const { privateKey } = ethers.decryptKeystoreJsonSync(stringFile, password);
      return await this.state.keyringService.addAccount(
        privateKey,
        { name: (file.meta?.name ?? '') as string, isMobile: false },
        WalletEcosystem.Substrate,
        'ethereum'
      );
    }
    const { address } = await this.state.keyringService.restoreAccount(file, password, linkedEthereumAddress);
    if (!isEthereumAddress(address)) {
      this.state.updateNetworkForNewWallet(address);
      await this.state.updateCurrentAccount({ address });
    }
    return address;
  }

  private async toggleNetworkFavorite(request: string | { networkName: string; address: string; favorite?: boolean }): Promise<void> {
    await this.state.setFavoriteNetwork(typeof request === 'string' ? request : request.networkName,
      typeof request === 'string' ? undefined : request.address, typeof request === 'string' ? undefined : request.favorite);
  }

  private async upsertNetworkMap(data: NetworkMapEdit): Promise<void> {
    if ('network' in data) await this.state.networkService.upsertNetworkMap(data.network, data.expected);
    else await this.state.networkService.upsertNetworkMap(data);
    this.state.updateServiceInfo();
  }

  async signEvmApprove({ id }: RequestSigningApprove): Promise<boolean> {
    const queued = this.state.requestService.getSignRequest(id, 'evm');
    assert(queued, 'Unable to find request');
    this.assertNormalWalletUse(queued.account.address);
    const handler = this.state.requestService.evmRequestHandler;
    const request = handler.claimEvmSignRequest(id);
    const assertCurrent = () => {
      if (handler.getEvmSignRequest(id) !== request) throw new Error('EVM signing request was cancelled');
      validateEvmSigningContext(this.state, request);
    };
    try {
      await this.assertSigningSiteAllowed(request);
      assertCurrent();
      const address = request.account.address;
      this.assertNormalWalletUse(address);
      if (request.account.isMobile) {
        if (!request.mobileSession) throw new Error('Mobile signing context is unavailable');
        try {
          const transaction =
            request.method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION
              ? captureMobileTransactionIntent(request.data, address, request.network.chainId)
              : undefined;
          const provider = transaction ? this.state.getEvmApi(request.network.name)?.api : undefined;
          const assertProviderCurrent = () => {
            assertCurrent();
            if (transaction && this.state.getEvmApi(request.network.name)?.api !== provider)
              throw new Error('EVM provider changed before mobile completion');
          };
          if (transaction) {
            if (!provider || (await provider.getNetwork()).chainId !== transaction.chainId)
              throw new Error('EVM provider does not match the reviewed network');
            assertProviderCurrent();
          }
          const result = await this.state.walletConnectDappService.onEvmRequest(
            id,
            request.method,
            structuredClone(request.data),
            request.mobileSession,
            assertProviderCurrent
          );
          if (result) {
            assertProviderCurrent();
            if (transaction) {
              // Never resubmit if lookup fails: the mobile wallet may have broadcast.
              const submitted = await provider!.getTransaction(result.payload);
              assertProviderCurrent();
              assertMobileTransactionResult(transaction, result.payload, submitted);
            } else assertEvmExternalSignature(request, result.payload);
            request.resolve(result);
          }
        } catch (error) {
          request.reject(error instanceof Error ? error : new Error('Unable to sign on the mobile wallet'));
          return false;
        }
        return true;
      }

      const provider = this.state.getEvmApi(request.network.name)?.api;
      const assertProviderCurrent = () => {
        assertCurrent();
        if (this.state.getEvmApi(request.network.name)?.api !== provider)
          throw new Error('EVM provider changed before approval');
      };
      const params = request.data as unknown[];
      const typed = request.method.startsWith('eth_signTypedData') ? evmTypedData(request.method, params) : undefined;
      const txData =
        request.method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION ? evmTransaction(params[0]) : undefined;
      let populated: ethers.TransactionRequest | undefined;
      if (request.method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
        if (!provider || (await provider.getNetwork()).chainId !== BigInt(request.network.chainId)) {
          throw new Error('EVM provider does not match the reviewed network');
        }
        assertProviderCurrent();
        // Complete every nonce/gas/fee await without a private key. A revoked
        // grant or replaced provider cannot be carried through population.
        populated = await new VoidSigner(address, provider).populateTransaction({
          ...txData,
          chainId: BigInt(request.network.chainId),
        });
        assertProviderCurrent();
      }
      const { privateKey } = this.state.keyringService.accountExportPrivateKey({ address });
      const signer = new Wallet(privateKey);
      if (signer.address.toLowerCase() !== address.toLowerCase())
        throw new Error('Exported key does not match the reviewed account');
      if (request.method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
        const signed = await signer.signTransaction(populated!);
        assertProviderCurrent();
        try {
          // Only the node's refusal fails the request. The site gets the hash of a transaction the network may
          // have: told it failed, it could send the amount again with a fresh nonce.
          const hash = await sendDappEvmTransaction(provider!, signed);
          request.resolve({ id: request.id, payload: hash as HexString });
        } catch (error) {
          // The node refused the transaction, so nothing was sent. Settle this intent.
          request.reject(error instanceof Error ? error : new Error('EVM submission was refused'));
          return false;
        }
      } else {
        const signature = await (typed
          ? signer.signTypedData(typed.domain, typed.types, typed.message)
          : signer.signMessage(evmMessageBytes(request.method, params)));
        assertCurrent();
        request.resolve({ id: request.id, payload: signature as HexString });
      }
      return true;
    } finally {
      handler.releaseEvmSignRequest(request);
    }
  }

  async signSolanaApprove({ id }: RequestSigningApprove): Promise<boolean> {
    const request = this.state.requestService.getSignRequest(id, 'solana') as SolanaRequestsSubjectPayload | undefined;

    assert(request, 'Unable to find request');
    // Checked before the request is marked as under approval: a refusal here must not leave it marked, which would
    // keep Reject and a closed page from ending it.
    this.assertNormalWalletUse(request.account.publicKey);
    if (this.pendingSiteApprovals.has(request)) throw new Error('Signing approval already pending');
    this.pendingSiteApprovals.add(request);

    try {
      await this.assertSigningSiteAllowed(request);
      this.assertNonEvmSigningAuthorization(request);
      const exportMnemonic = ({ address, walletEcosystem }: { address: string; walletEcosystem: string }) => {
        this.assertNonEvmSigningAuthorization(request);
        return this.state.keyringService.exportMnemonic({
          address,
          password: this.state.keyringService.getPassword(),
          walletEcosystem: walletEcosystem as WalletEcosystem,
        });
      };
      // A dApp's sign-and-send moves funds too, so the Solana send kill switch
      // covers it; sign-only requests are unaffected.
      if (request.method === 'signAndSendTransaction') await assertSendCapability(this.state, 'solanaSend');
      this.assertNonEvmSigningAuthorization(request);
      const accounts = this.state.keyringService.getAllAccounts();

      const response =
        request.method === 'signAndSendTransaction'
          ? await resolveSolanaSignAndSendTransaction({
              accounts,
              broadcastTransaction: (transactionBase64, options) => {
                this.assertNonEvmSigningAuthorization(request);
                return createClusterBoundSolanaRpcClient({ network: 'mainnet' }).sendRawTransaction(transactionBase64, options);
              },
              exportMnemonic,
              request,
            })
          : resolveSolanaSigning({
              accounts,
              exportMnemonic,
              request,
            });

      this.assertNonEvmSigningAuthorization(request);
      request.resolve(response);

      return true;
    } catch (error) {
      if (this.state.requestService.getSignRequest(id, 'solana') === request)
        request.reject(error instanceof Error ? error : new Error('Unable to sign Solana request'));

      return false;
    } finally {
      this.pendingSiteApprovals.delete(request);
    }
  }

  // The popup names the queue of the request it shows (`kind`): an approval only reaches that request.
  async signingApprove({ id, kind }: RequestSigningApprove): Promise<boolean> {
    const queued = this.state.requestService.getSignRequest(id, kind);

    assert(queued, 'Unable to find request');

    if (isSolanaSignRequest(queued)) return this.signSolanaApprove({ id });
    if (isEvmSignRequest(queued)) return this.signEvmApprove({ id }); // sign evm requests

    this.assertNormalWalletUse(queued.account.address);
    if (this.pendingSiteApprovals.has(queued)) throw new Error('Signing approval already pending');
    this.pendingSiteApprovals.add(queued);
    try {
      await this.assertSigningSiteAllowed(queued);
      this.assertNonEvmSigningAuthorization(queued);
      const { request, resolve } = queued;

      if (queued.signingAccount?.kind === 'mobile') {
        const res = await this.state.walletConnectDappService.onRequest(
          structuredClone(queued.request.payload),
          queued.signingAccount.mobileSession!,
          () => this.assertNonEvmSigningAuthorization(queued)
        );
        this.assertNonEvmSigningAuthorization(queued);
        assertSubstrateExternalSignature(queued, res.signature);
        resolve({ payload: res.signature, id });

        return true;
      }

      if (queued.signingAccount?.kind !== 'local') throw new Error('Substrate account requires an external signer');
      const pair = this.state.keyringService.getPair(queued.signingAccount.address);
      assertSubstrateSigningPair(queued, pair);

      // if the keyring pair is locked, the password is needed
      if (pair.isLocked) this.state.keyringService.unlockPair(pair);
      this.assertNonEvmSigningAuthorization(queued);
      assertSubstrateSigningPair(queued, pair);

      const result = await request.sign(createSubstrateSigningRegistry(queued.signingContext, request.payload), pair);
      this.assertNonEvmSigningAuthorization(queued);
      assertSubstrateSigningPair(queued, pair);
      assertSubstrateExternalSignature(queued, result.signature);
      resolve({ id, payload: result.signature });

      return true;
    } catch (error) {
      if (this.state.requestService.getSignRequest(id, 'substrate') === queued)
        queued.reject(error instanceof Error ? error : new Error('Unable to sign Substrate request'));
      // The popup names this refusal: the request sends funds to a destination that cannot deliver them.
      if (error instanceof CrossChainDestinationRetiredError) throw error;
      return false;
    } finally {
      this.pendingSiteApprovals.delete(queued);
    }
  }

  async signingApproveSignature({ id, signature, kind }: RequestSigningApproveSignature): Promise<boolean> {
    const queued = this.state.requestService.getSignRequest(id, kind);

    assert(queued, 'Unable to find request');

    this.assertNormalWalletUse(isEvmSignRequest(queued)
      ? queued.account.address
      : isSolanaSignRequest(queued) ? queued.account.publicKey : queued.account.address);

    if (isSolanaSignRequest(queued)) {
      queued.reject(new Error('External signature approval is not supported for Solana'));

      return false;
    }

    const evmHandler = this.state.requestService.evmRequestHandler;
    if (isEvmSignRequest(queued)) {
      assert(evmHandler.claimEvmSignRequest(id) === queued, 'Signing request was replaced');
    } else {
      if (this.pendingSiteApprovals.has(queued)) throw new Error('Signing approval already pending');
      this.pendingSiteApprovals.add(queued);
    }
    try {
      await this.assertSigningSiteAllowed(queued);
      if (isEvmSignRequest(queued)) {
        validateEvmSigningContext(this.state, queued);
        assertEvmExternalSignature(queued, signature);
      } else {
        this.assertNonEvmSigningAuthorization(queued);
        assertSubstrateExternalSignature(queued, signature);
      }
      queued.resolve({ id, payload: signature });
      return true;
    } catch (error) {
      if (this.state.requestService.getSignRequest(id, signingKindOf(queued)) === queued)
        queued.reject(error instanceof Error ? error : new Error('Unable to approve external signature'));
      throw error;
    } finally {
      if (isEvmSignRequest(queued)) evmHandler.releaseEvmSignRequest(queued);
      else this.pendingSiteApprovals.delete(queued);
    }
  }

  signingCancel({ id, kind }: RequestSigningCancel): boolean {
    const queued = this.state.requestService.getSignRequest(id, kind);

    assert(queued, 'Unable to find request');

    // An approval that submits the transaction may already have sent it. The dApp then gets that outcome, not
    // Cancelled, which it could answer by asking the user to pay again.
    if (isSolanaSignRequest(queued)) {
      if (queued.method === 'signAndSendTransaction' && this.pendingSiteApprovals.has(queued)) return false;
    } else if (isEvmSignRequest(queued) && queued.method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
      const handler = this.state.requestService.evmRequestHandler;

      // An approval in progress holds the request, so it cannot be claimed.
      try {
        handler.releaseEvmSignRequest(handler.claimEvmSignRequest(id));
      } catch {
        return false;
      }
    }

    queued.reject(new Error('Cancelled'));

    return true;
  }

  signingSubscribe(id: string, port?: Port): SigningRequest[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(signing.requests)'>(id, port);

    const signSubscription = this.state.requestService.signSubject.subscribe((requests: SigningRequest[]): void =>
      cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => signSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.signSubject.value;
  }

  signingEvmSubscribe(id: string, port?: Port): EvmRequests {
    const cb = this.state.subscriptionService.createSubscription<'pri(signing.evmRequests)'>(id, port);

    const signEvmSubscription = this.state.requestService.signEvmSubject.subscribe((requests: EvmRequests): void =>
      cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => signEvmSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.signEvmSubject.value;
  }

  signingSolanaSubscribe(id: string, port?: Port): SolanaRequests {
    const cb = this.state.subscriptionService.createSubscription<'pri(signing.solanaRequests)'>(id, port);

    const signSolanaSubscription = this.state.requestService.signSolanaSubject.subscribe(
      (requests: SolanaRequests): void => cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => signSolanaSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.signSolanaSubject.value;
  }

  async windowOpen(path: string): Promise<boolean> {
    const [tab] = await chrome.tabs.query({ url: EXTENSION_URL });

    if (tab && tab.id) {
      chrome.tabs.update(tab.id, { active: true });

      return true;
    }

    const url = `${chrome.runtime.getURL(`popup.html#${path}`)}`;

    withErrorLog(() => chrome.tabs.create({ url }));

    return true;
  }

  async removeAuthorization(url: string): Promise<ResponseAuthorizeList> {
    const list = await this.state.requestService.mutateAuthorizations((entries) => {
      delete entries[url];
    });
    return { list };
  }

  deleteAuthRequest(requestId: string): void {
    this.state.requestService.authorizeCancel({ id: requestId });
  }

  updateCurrentTabs({ tabs }: RequestActiveTabsUrlUpdate) {
    this.state.updateCurrentTabsUrl(tabs);
  }

  cancelAuthRequest(id: string) {
    this.state.requestService.authorizeCancel({ id });
  }

  private async fetchEvmBalance({ assetId, ethereumAddress }: FetchBalancePayload) {
    if (!this.state.isReady()) return;

    // Every active EVM network, as at start-up; a fixed list left out networks such as Kaia and ZetaChain.
    this.state.balanceService.evmBalanceService.fetchBalance({
      networks: this.state.networkService.activeNetworkByEcosystem.evmList,
      assetId,
      ethereumAddress,
    });
  }

  private subscribeBalance(id: string, port?: Port): Promise<BalanceJson> {
    const cb = this.state.subscriptionService.createSubscription<'pri(balance.subscription)'>(id, port);

    const balanceSubscription = this.state.balanceService.balanceSubject.subscribe({ next: (rs) => cb(rs) });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => balanceSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.balanceService.getBalance();
  }

  private updateCurrencySymbol(symbol: string) {
    this.state.pricesService.setFiatSymbol(symbol);
    this.state.pricesService.refreshPrice();
  }

  private getPrice(): Promise<PriceJson> {
    return new Promise<PriceJson>((resolve) => {
      this.state.pricesService.getPrice((rs: PriceJson) => resolve(rs));
    });
  }

  private subscribePrice(id: string, port?: chrome.runtime.Port): Promise<PriceJson> {
    const cb = this.state.subscriptionService.createSubscription<'pri(price.subscription)'>(id, port);

    const priceSubscription = this.state.pricesService.getSubject().subscribe({
      next: (rs) => {
        cb(rs);
      },
    });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => priceSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.getPrice();
  }

  public async soraFeesSubscribe(id: string, port?: Port) {
    const cb = this.state.subscriptionService.createSubscription<'pri(accounts.soraFees.subscribe)'>(id, port);

    const soraFeesSubscription = this.state.soraFees.subscribe({
      next: (rs) => cb(rs),
    });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => soraFeesSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));
  }

  private async checkSwap(options: RequestCheckSwap): Promise<ResponseCheckSwap> {
    const { AToB, BToA, amountA, amountB, minMaxValue, swapOptions, route } = await createSwap(
      options,
      apiSora,
      this.state
    );

    return {
      swapOptions,
      AToB,
      BToA,
      amountA,
      amountB,
      minMaxValue,
      route,
    };
  }

  private async makeSwap(options: RequestSwap): Promise<ResponseMakeSwap> {
    this.assertNormalWalletUse(this.state.getAccountAddress());
    if (!this.state.actionCapabilityService.isActionEnabled('polkaswap')) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'Polkaswap actions are temporarily unavailable.' }],
      };
    }

    if (!this.state.soraDisclaimerService.isAccepted()) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'Accept the Polkaswap risk disclaimer first.' }],
      };
    }

    const soraRoot = apiSora as unknown as {
      account?: { pair?: { address?: string; meta?: Record<string, unknown> } };
    };
    const pair = soraRoot.account?.pair;
    const selectedAddress = (() => {
      try {
        return this.state.getAccountAddress();
      } catch {
        return '';
      }
    })();
    if (options.isMobile || !isLocallySignableSelectedSoraPair(pair, selectedAddress, formatSoraAddress)) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'A locally signable SORA account is required.' }],
      };
    }

    const soraNetwork = this.state.networkService.networkValues.find(
      ({ name }) => name.toLowerCase() === SORA_NETWORK_NAME
    );
    const apiProps = this.state.getSubstrateApiMap[SORA_NETWORK_NAME];
    let runtimeReady: boolean;
    try {
      runtimeReady = Boolean(
        soraNetwork?.active && !soraNetwork.disabled && (await apiProps?.api?.isReady) && apiSora.connected
      );
    } catch {
      runtimeReady = false;
    }
    if (!runtimeReady) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'The SORA runtime is unavailable.' }],
      };
    }

    let swapOptions;
    let maximumSourceAmount;
    try {
      ({ swapOptions, maximumSourceAmount } = await prepareSwapExecution(options, apiSora, this.state));
    } catch {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.SWAP_ERROR, message: 'Refresh the SORA quote before confirming.' }],
      };
    }
    const { isExchangeB, swapDexId, amountA, amountB, slippage, assetA, assetB, marketType } = swapOptions!;
    const address = this.state.getAccountAddress();
    const liquiditySource = LIQUID_SOURCE_FOR_MARKET[marketType!];
    const balanceError = validatePolkaswapExecution({
      balances: this.state.balanceService.getAccountBalance(address) ?? [],
      networkFee: this.state.soraFees.value[Operation.Swap] ?? '',
      request: { ...options, amountA: maximumSourceAmount },
    });
    if (balanceError) return { status: false, errors: [balanceError] };

    let authoritativeError: BasicTxError | null;
    try {
      await apiSora.calcStaticNetworkFees();
      const networkFee = FPNumber.fromCodecValue(apiSora.NetworkFee[Operation.Swap]).toString();
      const [source, destination, xor] = await Promise.all([
        apiSora.assets.getAccountAsset(assetA.address),
        apiSora.assets.getAccountAsset(assetB.address),
        apiSora.assets.getAccountAsset(XOR),
      ]);
      this.state.soraFees.next({ ...this.state.soraFees.value, [Operation.Swap]: networkFee });
      authoritativeError = validateAuthoritativePolkaswapExecution({
        source,
        destination,
        xor,
        sourceAddress: assetA.address,
        destinationAddress: assetB.address,
        sourceAmount: maximumSourceAmount,
        networkFee,
      });
    } catch {
      authoritativeError = {
        code: BasicTxErrorCode.INVALID_PARAM,
        message: 'Refresh the authoritative SORA balances and current network fee.',
      };
    }
    if (authoritativeError) return { status: false, errors: [authoritativeError] };

    const finalSoraNetwork = this.state.networkService.networkValues.find(
      ({ name }) => name.toLowerCase() === SORA_NETWORK_NAME
    );
    const finalApiProps = this.state.getSubstrateApiMap[SORA_NETWORK_NAME];
    let finalRuntimeReady: boolean;
    try {
      finalRuntimeReady = Boolean(
        finalSoraNetwork?.active &&
        !finalSoraNetwork.disabled &&
        (await finalApiProps?.api?.isReady) &&
        apiSora.connected
      );
    } catch {
      finalRuntimeReady = false;
    }

    const currentSelectedAddress = (() => {
      try {
        return this.state.getAccountAddress();
      } catch {
        return '';
      }
    })();
    if (
      !finalRuntimeReady ||
      !this.state.actionCapabilityService.isActionEnabled('polkaswap') ||
      !this.state.soraDisclaimerService.isAccepted() ||
      !isCapturedSoraPairStillSelected(pair, soraRoot.account?.pair, currentSelectedAddress, formatSoraAddress)
    ) {
      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.UNSUPPORTED,
            message: 'The SORA account, policy, or runtime changed. Review the swap again.',
          },
        ],
      };
    }

    if (
      !this.state.keyringService.unlockPair(currentSelectedAddress) ||
      !this.state.actionCapabilityService.isActionEnabled('polkaswap') ||
      !this.state.soraDisclaimerService.isAccepted() ||
      !isCapturedSoraPairStillSelected(pair, soraRoot.account?.pair, currentSelectedAddress, formatSoraAddress)
    ) {
      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.UNSUPPORTED,
            message: 'Unlock the selected SORA account and review the swap again.',
          },
        ],
      };
    }

    apiSora.shouldPairBeLocked = false;

    try {
      await apiSora.swap.execute(assetA, assetB, amountA, amountB, slippage, isExchangeB, liquiditySource, swapDexId);
    } catch (ex) {
      const unknown = soraSubmissionUnknownResponse(ex);
      if (unknown) return unknown;
      console.info(`Swap transaction failed ${ex}`);
      return {
        status: false,
        errors: [{ code: TransferErrorCode.SWAP_ERROR, message: 'The SORA swap was not submitted.' }],
      };
    }

    return { status: true, errors: [] };
  }

  private createPolkamarktService(): PolkamarktService {
    const network = Object.values(this.state.networkService.networkMap).find(
      ({ name }) => name.toLowerCase() === SORA_NETWORK_NAME
    );
    const soraRoot = apiSora as unknown as {
      api?: unknown;
      account?: { pair?: { address?: string; meta?: Record<string, unknown>; isLocked?: boolean } };
      shouldPairBeLocked?: boolean;
      submitExtrinsic?: (extrinsic: unknown, pair: unknown) => Promise<unknown>;
      getTransactionFee?: (extrinsic: unknown) => Promise<string>;
    };
    const pair = soraRoot.account?.pair;
    const getSelectedAddress = () => {
      try {
        return this.state.getAccountAddress();
      } catch {
        return '';
      }
    };
    const selectedAddress = getSelectedAddress();
    const accountAddress = pair?.address || '';
    const signable = isLocallySignableSelectedSoraPair(pair, selectedAddress, formatSoraAddress);
    const capturedRuntime = soraRoot.api;
    const capturedSubmitExtrinsic = soraRoot.submitExtrinsic;
    const capturedNetwork = network
      ? {
          key: network.key,
          genesisHash: network.genesisHash,
          currentProvider: network.currentProvider,
        }
      : undefined;
    const isRuntimeReady = async () => {
      const currentNetwork = Object.values(this.state.networkService.networkMap).find(
        ({ name }) => name.toLowerCase() === SORA_NETWORK_NAME
      );
      const apiProps = this.state.getSubstrateApiMap[SORA_NETWORK_NAME];

      try {
        return Boolean(
          capturedNetwork &&
          currentNetwork?.key === capturedNetwork.key &&
          currentNetwork.genesisHash === capturedNetwork.genesisHash &&
          currentNetwork.currentProvider === capturedNetwork.currentProvider &&
          currentNetwork.active &&
          !currentNetwork.disabled &&
          capturedRuntime &&
          soraRoot.api === capturedRuntime &&
          (await apiProps?.api?.isReady) &&
          apiSora.connected
        );
      } catch {
        return false;
      }
    };

    return new PolkamarktService({
      apiRoot: soraRoot as unknown as Record<string, unknown>,
      endpoint: network?.currentProvider ?? network?.nodes?.[0]?.url,
      indexerUrl: network?.externalApi?.history?.url,
      accountAddress: accountAddress || undefined,
      signable,
      isDisclaimerAccepted: () => this.state.soraDisclaimerService.isAccepted(),
      authorizeBeforeSubmit: createPolkamarktFinalAuthorizationGuard({
        capturedAccountAddress: accountAddress,
        capturedPair: pair,
        capturedRuntime,
        isActionEnabled: () => this.state.actionCapabilityService.isActionEnabled('polkamarkt'),
        isDisclaimerAccepted: () => this.state.soraDisclaimerService.isAccepted(),
        assertWalletAction: ({ accountAddress, request }) =>
          this.assertNormalWalletUse(accountAddress, isRecoveryPolkamarktAction(request.action)),
        isRuntimeReady,
        getCurrentPair: () => soraRoot.account?.pair,
        getCurrentRuntime: () => soraRoot.api,
        getSelectedAddress,
        isSubmitAvailable: () =>
          Boolean(capturedSubmitExtrinsic && soraRoot.submitExtrinsic === capturedSubmitExtrinsic),
        unlockPair: (address) => this.state.keyringService.unlockPair(address),
        formatAddress: formatSoraAddress,
        onAuthorized: () => {
          soraRoot.shouldPairBeLocked = false;
        },
      }),
      estimateFee: async (extrinsic) => {
        if (!soraRoot.getTransactionFee) throw new Error('SORA network fee estimation is unavailable.');
        return soraRoot.getTransactionFee(extrinsic);
      },
      submit: async (extrinsic) => {
        if (!pair || !capturedSubmitExtrinsic) throw new Error('Add a signable SORA account.');
        const txHash = (extrinsic as { hash?: { toHex?: () => string; toString?: () => string } }).hash;
        await capturedSubmitExtrinsic.call(soraRoot, extrinsic, pair);
        return { hash: txHash?.toHex?.() ?? txHash?.toString?.() };
      },
    });
  }

  private async getPolkamarktSnapshot(request: { marketId?: string }) {
    const snapshot = await this.createPolkamarktService().snapshot(request.marketId);
    // Release policy keeps trading and claims off; browsing stays available. The
    // flag is separate from `warnings`, which report market data problems.
    snapshot.actionsPaused = !this.state.actionCapabilityService.isActionEnabled('polkamarkt');
    if (snapshot.actionsPaused) {
      snapshot.capabilities.buy = false;
      snapshot.capabilities.sell = false;
      snapshot.capabilities.claimMarket = false;
      snapshot.capabilities.claimCreatorFees = false;
    }
    return snapshot;
  }

  private getPolkamarktQuote(request: PolkamarktQuoteRequest) {
    return this.createPolkamarktService().quote(request);
  }

  private mutatePolkamarkt(request: PolkamarktMutationRequest) {
    this.assertNormalWalletUse(this.state.getAccountAddress(), isRecoveryPolkamarktAction(request.action));
    if (!this.state.actionCapabilityService.isActionEnabled('polkamarkt')) {
      return Promise.resolve({ status: false, error: 'Polkamarkt actions are temporarily paused.' });
    }
    return this.createPolkamarktService().mutate(request);
  }

  private async checkTransfer(request: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
    const { from, networkKey, to, assetId, relayChain, amount, solanaComputeUnitPriceMicroLamports } = request;
    const network = this.state.networkService.networkMap[networkKey];

    let fee = '0';
    const errors: BasicTxError[] = [];

    if (isBitcoinTransferNetwork(network)) {
      try {
        const bitcoin = await quoteBitcoinTransfer({
          amount: amount ?? '0',
          bitcoinFeeRateSatPerVbyte: request.bitcoinFeeRateSatPerVbyte,
          bitcoinFeeTargetBlocks: request.bitcoinFeeTargetBlocks,
          bitcoinIncludeUnconfirmed: request.bitcoinIncludeUnconfirmed,
          bitcoinMaxInputs: request.bitcoinMaxInputs,
          from,
          networkKey,
          state: this.state,
          to,
        });

        if (bitcoin.unavailableReason) {
          errors.push({ message: bitcoin.unavailableReason, code: TransferErrorCode.TRANSFER_ERROR });
        }

        return { maxAmount: bitcoin.maxSendable, destEstimateFee: '0', estimateFee: bitcoin.fee, errors, bitcoin };
      } catch (e) {
        console.info(e);
        errors.push({
          message: (e as Error).message,
          code: TransferErrorCode.TRANSFER_ERROR,
        });
      }

      return {
        destEstimateFee: '0',
        estimateFee: fee.toString(),
        errors,
      };
    }

    if (isIrohaTransferNetwork(network)) {
      try {
        fee = await estimateIrohaTransferFee(
          {
            amount: amount ?? '0',
            assetId,
            from,
            networkKey,
            state: this.state,
            to,
          },
          getIrohaTransferFrameBytes
        );
      } catch (e) {
        console.info(e);
        errors.push({
          message: (e as Error).message,
          code: TransferErrorCode.TRANSFER_ERROR,
        });
      }

      return {
        destEstimateFee: '0',
        estimateFee: fee.toString(),
        errors,
      };
    }

    if (isSolanaTransferNetwork(network)) {
      try {
        // The Send screen passes the priority fee of the quote it is repricing, so the price does not move under it.
        const { fee: quotedFee, ...solana } = await quoteSolanaTransfer({
          amount: amount ?? '0',
          assetId,
          from,
          networkKey,
          solanaComputeUnitPriceMicroLamports,
          state: this.state,
          to,
        });

        if (solana.unavailableReason) {
          errors.push({ message: solana.unavailableReason, code: TransferErrorCode.TRANSFER_ERROR });
        }

        return { destEstimateFee: '0', estimateFee: quotedFee, maxAmount: solana.maxSendable, errors, solana };
      } catch (e) {
        console.info(e);
        errors.push({
          message: (e as Error).message,
          code: TransferErrorCode.TRANSFER_ERROR,
        });
      }

      return {
        destEstimateFee: '0',
        estimateFee: fee.toString(),
        errors,
      };
    }

    const substrateAddress = this.state.keyringService.getSubstrateAddress(from);
    const tokenBalance = this.state.balanceService.getTokenBalance(substrateAddress, assetId, relayChain, networkKey);
    const balance = getBalanceItem(tokenBalance.balances, networkKey)!;

    // Estimate with EVM API
    if (isNativeEVMNetwork(networkKey)) {
      try {
        // The send caps its fee at this quote, so the quote prices the amount being sent; without one, the balance.
        const entered = typeof amount === 'string' && /^\d+(?:\.\d+)?$/u.test(amount) && +amount > 0;
        const { fee: feeValue } = await quoteEVMTransfer(
          {
            balance,
            networkKey,
            to,
            from,
            amount: entered ? amount : balance?.transferable || '0',
          },
          this.state
        );

        fee = formatUnits(feeValue, 18);
      } catch (e) {
        console.info(e);
        errors.push({
          message: 'common.estimateFeeError',
          code: TransferErrorCode.TRANSFER_ERROR,
        });
      }
    } else if (isTonNetwork(networkKey)) {
      // A jetton send also gives its jetton wallet TON to pay for the transfer, so the TON balance must cover both.
      fee = maxTonTransferFee(balance);
    } else {
      // Estimate with DotSama API
      fee = await estimateFee(networkKey, to, amount, tokenBalance, this.state);
    }

    return {
      destEstimateFee: '0',
      estimateFee: fee.toString(),
      errors,
    };
  }

  private async makeTransfer(id: string, request: RequestTransfer, port?: Port): Promise<BasicTxResponse | undefined> {
    const { networkKey, from, to, assetId, isMobile, relayChain, amount = '0' } = request;

    this.state.keyringService.unlockPair(from);

    const callback = this.state.subscriptionService.createSubscription<'pri(accounts.makeTransfer)'>(id, port);
    const network = this.state.networkService.networkMap[networkKey];

    let tokenSymbol = assetId;
    let balance;

    if (!isBitcoinTransferNetwork(network) && !isIrohaTransferNetwork(network) && !isSolanaTransferNetwork(network)) {
      const substrateAddress = this.state.keyringService.getSubstrateAddress(from);
      const tokenBalance = this.state.balanceService.getTokenBalance(substrateAddress, assetId, relayChain, networkKey);

      tokenSymbol = tokenBalance.symbol;
      balance = getBalanceItem(tokenBalance.balances, networkKey)!;
    }

    let transferProm: Promise<void> | undefined;

    const params = {
      networkKey,
      from,
      to,
      amount,
      callback,
      state: this.state,
      isMobile: !!isMobile,
      assetId,
      balance: balance!,
    };

    if (isBitcoinTransferNetwork(network)) {
      transferProm = makeBitcoinTransfer({
        amount,
        approvedMaxFee: request.approvedMaxFee,
        bitcoinFeeRateSatPerVbyte: request.bitcoinFeeRateSatPerVbyte,
        bitcoinFeeTargetBlocks: request.bitcoinFeeTargetBlocks,
        bitcoinIncludeUnconfirmed: request.bitcoinIncludeUnconfirmed,
        bitcoinMaxInputs: request.bitcoinMaxInputs,
        bitcoinSelectedOutpoints: request.bitcoinSelectedOutpoints,
        callback,
        from,
        networkKey,
        state: this.state,
        to,
      });
    } else if (isIrohaTransferNetwork(network)) {
      transferProm = requireProductionIrohaTransferCodec().then((codec) =>
        makeIrohaTransfer(
          {
            amount,
            approvedMaxFee: request.approvedMaxFee,
            assetId,
            callback,
            from,
            networkKey,
            state: this.state,
            to,
          },
          codec,
          getIrohaTransferFrameBytes
        )
      );
    } else if (isSolanaTransferNetwork(network)) {
      transferProm = makeSolanaTransfer({
        amount,
        approvedMaxFee: request.approvedMaxFee,
        assetId,
        callback,
        from,
        networkKey,
        solanaComputeUnitPriceMicroLamports: request.solanaComputeUnitPriceMicroLamports,
        state: this.state,
        to,
      });
    } else if (isNativeEVMNetwork(networkKey)) {
      // The reviewed fee caps the send, as it does for Bitcoin, Solana and Iroha. Without one no key is opened.
      if (typeof request.approvedMaxFee !== 'string') {
        transferProm = Promise.reject(new Error('transfer_fee_approval_required'));
      } else {
        const { privateKey } = this.state.keyringService.accountExportPrivateKey({ address: from });

        transferProm = makeEVMTransfer(
          {
            ...params,
            approvedMaxFee: request.approvedMaxFee,
            privateKey,
            networkKey,
          },
          this.state
        );
      }
    } else if (isTonNetwork(networkKey)) {
      transferProm = makeTonTransfer(params, this.state);
    } else transferProm = makeTransfer(params);

    try {
      await transferProm;

      console.info(
        `
        Start transfer: ${amount} ${tokenSymbol}
        from ${from}
        to ${to}
      `
      );
    } catch (ex) {
      console.error(
        `
        Transfer error:
        ${ex}
      `
      );

      const response: BasicTxResponse = {
        status: false,
        ...(ex instanceof IrohaTransactionStatusUnknownError ||
        ex instanceof BitcoinTransactionStatusUnknownError ||
        ex instanceof SolanaTransactionStatusUnknownError
          ? { outcome: 'unknown' as const, transactionHash: ex.transactionHash }
          : {}),
        errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: (ex as Error).message }],
      };
      callback(response);

      setTimeout(() => this.cancelSubscription(id), 500);
      return response;
    }

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return { status: true };
  }

  private async checkCrossChain(request: RequestCheckCrossChain): Promise<ResponseCheckCrossChain> {
    const { from, originNet, destinationNet, to, assetId, assetKey, routeId, routeProviderId, relayChain, amount } =
      request;

    try {
      await refreshCrossChainOriginBalance({ from, originNet }, this.state);
      const substrateAddress = this.state.keyringService.getSubstrateAddress(from);
      const tokenBalance = this.state.balanceService.getTokenBalance(substrateAddress, assetId, relayChain, originNet);
      const validation = validateReviewedCrossChainRequest({
        routeId,
        providerId: routeProviderId,
        assetKey,
        assetId,
        origin: this.state.networkService.networkMap[originNet],
        destination: this.state.networkService.networkMap[destinationNet],
        tokenBalance,
        amount,
        to,
        requireAmount: Boolean(amount?.trim()),
      });
      if (!this.state.actionCapabilityService.isActionEnabled(validation.action)) {
        throw new Error('cross_chain_provider_temporarily_disabled');
      }
      await assertCrossChainSendAvailable(
        { address: substrateAddress, routeId: validation.routeId },
        this.state.getSubstrateApiMap[originNet.toLowerCase()]?.api
      );
      if (!amount?.trim()) return { estimateFee: '0', destEstimateFee: '0' };

      const quote = await estimateCrossChainQuote(
        {
          assetId,
          assetKey,
          routeId: validation.routeId,
          routeProviderId: validation.providerId,
          xcmAssetId: validation.xcmAssetId,
          execution: validation.execution,
          reviewedMinimum: validation.minimum,
          originNet,
          destinationNet,
          amount,
          from,
          to,
          tokenBalance,
        },
        this.state
      );

      const estimateFee = quote.originFee.toString();
      const destEstimateFee = quote.destinationFee.toString();

      return {
        estimateFee,
        destEstimateFee,
        minimum: quote.minimum.toString(),
        executionFingerprint: quote.executionFingerprint,
        // Only a send that presents this token, unchanged and in time, can use this quote.
        quoteToken: crossChainQuoteTokens.issue({
          from,
          to,
          amount,
          originNet,
          destinationNet,
          assetId,
          assetKey,
          routeId,
          routeProviderId,
          originFee: estimateFee,
          destinationFee: destEstimateFee,
          executionFingerprint: quote.executionFingerprint,
        }),
      };
    } catch (error) {
      return {
        estimateFee: '0',
        destEstimateFee: '0',
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: error instanceof Error ? error.message : String(error) }],
      };
    }
  }

  private async makeCrossChain(id: string, request: RequestCrossChain, port?: Port): Promise<BasicTxResponse> {
    this.assertNormalWalletUse(request.from);
    const {
      from,
      originNet,
      destinationNet,
      to,
      assetId,
      assetKey,
      routeId,
      routeProviderId,
      relayChain,
      isMobile,
      amount = '',
      expectedOriginFee = '',
      expectedDestinationFee = '',
      expectedExecutionFingerprint = '',
      quoteToken,
    } = request;
    let tokenBalance: ReturnType<State['balanceService']['getTokenBalance']>;
    let xcmAssetId: string;
    let execution: ValidatedCrossChainRoute['execution'];
    let reviewedMinimum: string | null;
    let capturedPair: ReturnType<State['keyringService']['getPair']>;

    try {
      // Spent before any other work: one quote the background issued allows one send of exactly that quote.
      crossChainQuoteTokens.consume(quoteToken, {
        from,
        to,
        amount,
        originNet,
        destinationNet,
        assetId,
        assetKey,
        routeId,
        routeProviderId,
        originFee: expectedOriginFee,
        destinationFee: expectedDestinationFee,
        executionFingerprint: expectedExecutionFingerprint,
      });
      await refreshCrossChainOriginBalance({ from, originNet }, this.state);
      const substrateAddress = this.state.keyringService.getSubstrateAddress(from);
      tokenBalance = this.state.balanceService.getTokenBalance(substrateAddress, assetId, relayChain, originNet);
      capturedPair = this.state.keyringService.getPair(substrateAddress);
      const validation = validateReviewedCrossChainRequest({
        routeId,
        providerId: routeProviderId,
        assetKey,
        assetId,
        origin: this.state.networkService.networkMap[originNet],
        destination: this.state.networkService.networkMap[destinationNet],
        tokenBalance,
        amount,
        to,
        requireAmount: true,
      });
      if (!this.state.actionCapabilityService.isActionEnabled(validation.action)) {
        throw new Error('cross_chain_provider_temporarily_disabled');
      }
      const selectedAddress = this.state.keyringService.getSubstrateAddress(this.state.getAccountAddress());
      if (!capturedPair || this.state.keyringService.getPair(selectedAddress) !== capturedPair) {
        throw new Error('cross_chain_selected_account_changed');
      }
      assertCrossChainSignerCapability(capturedPair, !!isMobile);
      if (!expectedOriginFee.trim()) throw new Error('cross_chain_fee_confirmation_required');
      if (!expectedDestinationFee.trim()) throw new Error('cross_chain_destination_fee_confirmation_required');
      if (!expectedExecutionFingerprint.trim()) throw new Error('cross_chain_runtime_fingerprint_required');
      xcmAssetId = validation.xcmAssetId;
      execution = validation.execution;
      reviewedMinimum = validation.minimum;
    } catch (error) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: error instanceof Error ? error.message : String(error) }],
      };
    }

    const callback = this.state.subscriptionService.createSubscription<'pri(accounts.makeCrossChain)'>(id, port);
    let subscribed = true;
    const closeSubscription = () => {
      if (!subscribed) return;
      subscribed = false;
      this.cancelSubscription(id);
    };
    // Closing the popup stops the updates, not the send: the outcome is still tracked and recorded.
    port?.onDisconnect.addListener(closeSubscription);

    const params: MakeCrossChainProps = {
      assetId,
      xcmAssetId,
      execution,
      reviewedMinimum,
      originNet,
      destinationNet,
      amount,
      from,
      to,
      tokenBalance,
      callback,
      isMobile: !!isMobile,
      assetKey,
      routeId,
      routeProviderId,
      relayChain,
      expectedOriginFee,
      expectedDestinationFee,
      expectedExecutionFingerprint,
      capturedPair,
    };

    let response: BasicTxResponse;

    try {
      response = await makeCrossChain(params, this.state);

      console.info(
        `
        CrossChain ${response.status ? 'included' : response.outcome ?? 'failed'}: ${amount} ${tokenBalance.symbol}
        [${originNet}] => [${destinationNet}]
        from ${from}
        to ${to}
      `
      );
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : String(ex);

      console.error(
        `
        CrossChain error:
        ${message}
      `
      );

      response = {
        status: false,
        // A refused resend shows the earlier extrinsic, which may already have moved the funds.
        ...(ex instanceof CrossChainPreviousSendUnresolvedError
          ? { outcome: 'unknown' as const, transactionHash: ex.transactionHash }
          : {}),
        errors: [{ code: TransferErrorCode.CROSSCHAIN_ERROR, message }],
      };
      callback(response);
    }

    setTimeout(closeSubscription, 500);

    return response;
  }

  public checkScamAddress(request: RequestCheckScam) {
    return this.state.scamService.checkScamAddress(request);
  }

  private async createMobileWallet({ address, meta }: RequestAddressCreate) {
    const selected = this.state.currentAccount;
    const selectedAddress = selected?.address;
    const revision = this.state.keyringService.currentAccountRevision;
    const assertCurrent = () => {
      if (this.state.currentAccount !== selected || this.state.currentAccount?.address !== selectedAddress ||
        this.state.keyringService.currentAccountRevision !== revision)
        throw new Error('Wallet selection changed during mobile import. Retry with the current wallet.');
    };
    await this.state.keyringService.saveAddress(address, meta, 'address', { assertCurrent });

    assertCurrent();
    await this.state.updateCurrentAccount({ address }, true, { assertCurrent: () => {} });
    return true;
  }

  private subscribeNetworkMap(id: string, port?: Port): Record<string, NetworkJson> {
    const cb = this.state.subscriptionService.createSubscription<'pri(networkMap.getSubscription)'>(id, port);

    const networkMapSubscription = this.state.networkService.networkMapStore
      .getSubject()
      .subscribe({ next: (rs) => cb(rs) });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => networkMapSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.networkService.networkMap;
  }

  private subscribeSelectedNetworks(id: string, port?: Port) {
    const cb = this.state.subscriptionService.createSubscription<'pri(selectedNetworks.getSubscription)'>(id, port);

    const selectedNetworksSubscription = this.state.networkService.selectedNetworksStore.getSubject().subscribe({
      next: (rs) => {
        const network = rs[this.state.currentAccount?.address ?? ''];

        if (network) cb(network);
      },
    });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => selectedNetworksSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));
  }

  async checkController(params: CheckControllerRequest): Promise<boolean> {
    const address = this.state.getCurrentAddress('westend');
    const stashAddress = await this.state.stakingService.getStashByController(params.address);

    if (stashAddress === '') return true;

    // Если для address существует stashAddress и он отличается от address, тогда address уже является контроллер аккаунтом
    const isValidController = this.state.isSameAddress(
      { address: stashAddress, ethereumAddress: stashAddress },
      { address, ethereumAddress: address }
    );

    return isValidController;
  }

  async getMyStakingInfo(params: StakingNetworkRequest): Promise<MyStakingInfoResponse> {
    const validators = await this.state.stakingService.getValidators(params.network);

    return this.state.stakingService.getMyStakingInfo(params.network, validators);
  }

  async makeStaking(request: MakeStakingRequest): Promise<BasicTxResponse> {
    const recoveryAction = isRecoveryStakingAction(request.type);
    this.assertNormalWalletUse(request.params.from, recoveryAction);
    this.assertNormalWalletUse(this.state.getAccountAddress(), recoveryAction);
    const { from } = request.params;

    this.state.keyringService.unlockPair(from);

    return await this.state.stakingService.makeStaking(request);
  }

  async makePool(request: MakePoolsRequest): Promise<BasicTxResponse> {
    this.assertNormalWalletUse(this.state.getAccountAddress(), isRecoveryPoolAction(request.type));
    if (!this.state.actionCapabilityService.isActionEnabled('polkaswap')) {
      return {
        status: false,
        errors: [
          { code: TransferErrorCode.UNSUPPORTED, message: 'Polkaswap liquidity actions are temporarily unavailable.' },
        ],
      };
    }
    if (!this.state.soraDisclaimerService.isAccepted()) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'Accept the Polkaswap risk disclaimer first.' }],
      };
    }

    const signing = this.state.poolsService.getLiquiditySigningCapability();
    if (!signing.available) {
      return {
        status: false,
        errors: [
          { code: TransferErrorCode.UNSUPPORTED, message: signing.reason ?? 'A signable SORA account is required.' },
        ],
      };
    }

    return this.state.poolsService.makePool(request);
  }

  async mutateDemeter(request: DemeterMutationRequest): Promise<BasicTxResponse> {
    this.assertNormalWalletUse(this.state.getAccountAddress(), isRecoveryDemeterAction(request.operation));
    if (!this.state.actionCapabilityService.isActionEnabled('demeter')) {
      return {
        status: false,
        errors: [{ code: TransferErrorCode.UNSUPPORTED, message: 'Demeter actions are temporarily unavailable.' }],
      };
    }

    const signing = this.state.poolsService.getDemeterSigningCapability();
    if (!signing.available) {
      return {
        status: false,
        errors: [
          { code: TransferErrorCode.UNSUPPORTED, message: signing.reason ?? 'A signable SORA account is required.' },
        ],
      };
    }

    return this.state.poolsService.mutateDemeter(request);
  }

  async getShareOfPool(params: GetShareOfPoolRequest): Promise<string> {
    return params.type === 'addLiquidity'
      ? await this.state.poolsService.getShareOfPoolByAddLiquidity(params)
      : this.state.poolsService.getShareOfPoolByRemoveLiquidity(params);
  }

  private async fetchBalance({
    address,
    networks,
    bitcoinAddress,
    bitcoinTestnetAddress,
    ethereumAddress,
    solanaAddress,
    irohaAddress,
    walletEcosystem,
  }: FetchBalanceRequest): Promise<ResponseBalanceRequest[]> {
    const account = this.state.keyringService
      .getAllMainAccounts()
      .find(({ address: accountAddress }) => isSameString(accountAddress, address));
    const publicAccounts = account?.meta.universalWallet?.publicAccounts ?? [];
    const isUniversal = new Set(publicAccounts.map(({ ecosystem }) => ecosystem)).size > 1;

    if (isUniversal) {
      return this.state.balanceService.fetchBalance({
        address,
        bitcoinAddress: bitcoinAddress ?? (account?.meta.bitcoinAddress as string | undefined),
        bitcoinTestnetAddress: bitcoinTestnetAddress ?? (account?.meta.bitcoinTestnetAddress as string | undefined),
        bitcoinNetworks: filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['bitcoin']),
        ethereumAddress: ethereumAddress ?? account?.meta.ethereumAddress ?? '',
        evmNetworks: filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['ethereum']),
        irohaAddress: irohaAddress ?? (account?.meta.irohaAddress as string | undefined),
        irohaNetworks: filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['iroha']),
        solanaAddress: solanaAddress ?? (account?.meta.solanaAddress as string | undefined),
        solanaNetworks: filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['solana']),
        substrateNetworks: filterNetworksByEcosystem(this.state.networkService.networkMap, networks, [
          'substrate',
          'ethereumBased',
        ]),
        tonNetworks: filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['ton']),
        walletEcosystem,
      });
    }

    if (walletEcosystem === WalletEcosystem.Bitcoin) {
      return await this.state.balanceService.fetchBalance({
        address,
        bitcoinAddress,
        bitcoinTestnetAddress,
        bitcoinNetworks: filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['bitcoin']),
        ethereumAddress: ethereumAddress ?? '',
        walletEcosystem,
      });
    }

    if (walletEcosystem === WalletEcosystem.Ton) {
      const tonNetworks = filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['ton']);

      return await this.state.balanceService.fetchBalance({
        address,
        tonNetworks,
        ethereumAddress: ethereumAddress ?? '',
        walletEcosystem,
      });
    }

    if (walletEcosystem === WalletEcosystem.Solana) {
      const solanaNetworks = filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['solana']);

      return await this.state.balanceService.fetchBalance({
        address,
        solanaAddress,
        solanaNetworks,
        ethereumAddress: ethereumAddress ?? '',
        walletEcosystem,
      });
    }

    if (walletEcosystem === WalletEcosystem.Iroha) {
      const irohaNetworks = filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['iroha']);

      return await this.state.balanceService.fetchBalance({
        address,
        irohaAddress,
        irohaNetworks,
        ethereumAddress: ethereumAddress ?? '',
        walletEcosystem,
      });
    }

    const evmNetworks = filterNetworksByEcosystem(this.state.networkService.networkMap, networks, ['ethereum']);

    const substrateNetworks = filterNetworksByEcosystem(this.state.networkService.networkMap, networks, [
      'substrate',
      'ethereumBased',
    ]);

    return await this.state.balanceService.fetchBalance({
      address,
      evmNetworks,
      substrateNetworks,
      ethereumAddress: ethereumAddress ?? '',
      walletEcosystem,
    });
  }

  async connectWalletConnect({ uri }: RequestConnectWalletConnect): Promise<Record<string, string> | boolean> {
    return this.state.walletConnectService
      .connect(uri)
      .then(() => true)
      .catch((error) => {
        if ((error.message as string).includes(getInternalError('MISSING_OR_INVALID').message))
          return { message: 'walletConnect.pairingErrorMessage' };
        if (error.message === getInternalError('UNKNOWN_TYPE').message)
          return { message: 'walletConnect.relayNotSupported' };

        return { message: 'Unknown error' };
      });
  }

  private connectWCSubscribe(id: string, port?: chrome.runtime.Port): WalletConnectSessionRequest[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(walletConnect.requests.connect.subscribe)'>(
      id,
      port
    );

    const subscription = this.state.requestService.connectWCSubject.subscribe(
      (requests: WalletConnectSessionRequest[]): void => cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => subscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.allConnectWCRequests;
  }

  private async approveWalletConnectSession({
    accounts: selectedAccounts,
    id,
  }: RequestApproveConnectWalletSession): Promise<NotificationResponse> {
    selectedAccounts.forEach((address) => this.assertNormalWalletUse(address));
    const request = this.state.requestService.getConnectWCRequest(id);

    if (isProposalExpired(request.request.params)) {
      request.reject(new Error('The proposal has been expired'));

      return {
        message: 'walletConnect.notifications.sessionExpired.message',
        title: 'walletConnect.notifications.sessionExpired.title',
        status: false,
      };
    }

    const { id: wcId, params } = request.request;
    const { requiredNamespaces, optionalNamespaces } = params;

    const availableNamespaces: ProposalTypes.RequiredNamespaces = {};

    const namespaces: SessionTypes.Namespaces = {};
    const chainInfoMap = this.state.networkService.networkMap;
    const requiredEntries = Object.entries(requiredNamespaces);
    const optionalEntries = Object.entries(optionalNamespaces);

    for (const [key, namespace] of requiredEntries) {
      if (isSupportWalletConnectNamespace(key)) {
        if (namespace.chains) {
          const unSupportChains = namespace.chains.filter((chain) => !isSupportWalletConnectChain(chain, chainInfoMap));

          if (unSupportChains.length) {
            request.reject(new Error('Unsupported chain'));

            return {
              message: 'walletConnect.notifications.unsupportedProposal.message',
              title: 'walletConnect.notifications.unsupportedProposal.title',
              status: false,
            };
          }

          availableNamespaces[key] = namespace;
        }
      } else {
        request.reject(new Error('Unsupported chain'));

        return {
          message: 'walletConnect.notifications.unsupportedProposal.message',
          title: 'walletConnect.notifications.unsupportedProposal.title',
          status: false,
        };
      }
    }

    for (const [key, namespace] of optionalEntries) {
      if (!isSupportWalletConnectNamespace(key)) continue;
      if (!namespace.chains) continue;

      const supportChains = namespace.chains.filter((chain) => isSupportWalletConnectChain(chain, chainInfoMap)) || [];

      const requiredNameSpace = availableNamespaces[key];
      const defaultChains: string[] = [];

      if (requiredNameSpace) {
        const chains = [...(requiredNameSpace.chains || defaultChains), ...(supportChains || defaultChains)];
        availableNamespaces[key] = {
          chains,
          events: requiredNameSpace.events,
          methods: requiredNameSpace.methods,
        };
      } else {
        if (supportChains.length) {
          availableNamespaces[key] = {
            chains: supportChains,
            events: namespace.events,
            methods: namespace.methods,
          };
        }
      }
    }

    const availableEntries = Object.entries(availableNamespaces);

    for (const [key, namespace] of availableEntries) {
      if (!namespace.chains) continue;

      const accounts: string[] = [];

      const chains = uniqueStringArray(namespace.chains);
      const substrateAddress = this.state.keyringService.getSubstrateAddress(selectedAccounts[0]);

      chains.forEach((chain) => {
        if (key === WALLET_CONNECT_EIP155_NAMESPACE) accounts.push(`${chain}:${selectedAccounts[0]}`);
        else if (key === WALLET_CONNECT_POLKADOT_NAMESPACE) accounts.push(`${chain}:${substrateAddress}`);
      });

      namespaces[key] = {
        accounts,
        methods:
          key === WALLET_CONNECT_EIP155_NAMESPACE
            ? [...WALLET_CONNECT_SUPPORTED_METHODS, ...namespace.methods]
            : namespace.methods,
        events: namespace.events,
        chains: chains,
      };
    }

    const result: ResultApproveWalletConnectSession = {
      id: wcId,
      namespaces,
      relayProtocol: params.relays[0].protocol,
    };

    const res = await this.state.walletConnectService.approveSession(result).catch((e) => {
      return { message: e.message, title: '', status: false };
    });
    if (res) return res;

    request.resolve();

    return {
      message: '',
      title: 'walletConnect.notifications.sessionApproved.title',
      status: true,
    };
  }

  private async rejectWalletConnectSession({ id }: RequestRejectConnectWalletSession): Promise<boolean> {
    const request = this.state.requestService.getConnectWCRequest(id);

    const wcId = request.request.id;

    if (isProposalExpired(request.request.params)) {
      request.reject(new Error('The proposal has been expired'));

      return true;
    }

    await this.state.walletConnectService.rejectSession(wcId);
    request.reject(new Error('USER_REJECTED'));

    return true;
  }

  private subscribeWalletConnectSessions(id: string, port?: chrome.runtime.Port): SessionTypes.Struct[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(walletConnect.session.subscribe)'>(id, port);

    const subscription = this.state.walletConnectService.sessionSubject.subscribe((rs) => {
      cb(rs);
    });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => subscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.walletConnectService.sessions ?? [];
  }

  private async disconnectWalletConnectSession({ topic }: RequestDisconnectWalletConnectSession): Promise<boolean> {
    await this.state.walletConnectService.disconnect(topic);

    return true;
  }

  wcSigningSubscribe(id: string, port?: Port): WalletConnectTransactionRequest[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(walletConnect.signing.requests.subscribe)'>(
      id,
      port
    );

    const requestSubscription = this.state.requestService.signWcSubject.subscribe(
      (requests: WalletConnectTransactionRequest[]): void => cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => requestSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.signWcSubject.value;
  }

  async wcRequestApprove({ address, approvalId }: RequestApproveWalletConnect) {
    this.assertNormalWalletUse(address);
    const resolvedSigner = this.state.keyringService.getEthereumAddress(this.state.keyringService.getSubstrateAddress(address));
    this.assertNormalWalletUse(resolvedSigner);
    const handler = this.state.requestService.evmRequestHandler;
    const request = handler.claimWCSignRequest(approvalId);
    try {
      const context = validateWalletConnectSigningContext(this.state, request.request);
      const assertCurrent = () => {
        this.state.keyringLockService?.lockIfExpired();
        if (handler.getSignWCRequest(approvalId) !== request) throw new Error('WalletConnect request was cancelled');
        validateWalletConnectSigningContext(this.state, request.request);
      };
      this.assertNormalWalletUse(address);
      const substrateAddress = this.state.keyringService.getSubstrateAddress(address);
      const ethereumAddress = this.state.keyringService.getEthereumAddress(substrateAddress);
      this.assertNormalWalletUse(ethereumAddress);
      if (ethereumAddress.toLowerCase() !== context.account.address.toLowerCase())
        throw new Error('WalletConnect request does not match the selected signer');
      if (context.account.isMobile) throw new Error('WalletConnect mobile signing is unavailable');
      if (await checkIfDenied(context.session.origin)) {
        assertCurrent();
        request.reject(new Error('WalletConnect requester is blocked'));
        throw new Error('WalletConnect requester is blocked');
      }
      assertCurrent();
      const method = request.request.params.request.method;
      const params = request.request.params.request.params;
      const messageBytes =
        method === 'personal_sign' || method === 'eth_sign' ? evmMessageBytes(method, params) : undefined;
      const typed = method.startsWith('eth_signTypedData') ? evmTypedData(method, params) : undefined;
      const txData = method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION ? evmTransaction(params[0]) : undefined;
      const provider = this.state.getEvmApi(context.network.name)?.api;
      const assertProviderCurrent = () => {
        assertCurrent();
        if (this.state.getEvmApi(context.network.name)?.api !== provider)
          throw new Error('WalletConnect provider changed before approval');
      };
      let populated: ethers.TransactionRequest | undefined;
      if (txData) {
        if (!provider || (await provider.getNetwork()).chainId !== BigInt(context.network.chainId))
          throw new Error('WalletConnect provider does not match the reviewed network');
        assertProviderCurrent();
        // Population awaits nonce, gas and fee RPCs. Keep those awaits before
        // private-key access, then revalidate the grant and provider again.
        populated = await new VoidSigner(ethereumAddress, provider).populateTransaction({
          ...txData,
          chainId: BigInt(context.network.chainId),
        });
        assertProviderCurrent();
      }
      const { privateKey } = this.state.keyringService.accountExportPrivateKey({ address: ethereumAddress });

      const signer = new Wallet(privateKey);
      if (signer.address.toLowerCase() !== ethereumAddress.toLowerCase())
        throw new Error('Exported key does not match the WalletConnect account');

      if (method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
        const signed = await signer.signTransaction(populated!);
        assertProviderCurrent();
        try {
          // Only the node's refusal fails the request. The dApp gets the hash of a transaction the network may
          // have: told it failed, it could send the amount again with a fresh nonce.
          const hash = await sendDappEvmTransaction(provider!, signed);
          request.resolve({ id: request.request.topic, payload: hash as HexString });
        } catch (error) {
          // The node refused the transaction, so nothing was sent. Consume this intent.
          request.reject(error instanceof Error ? error : new Error('WalletConnect submission was refused'));
          return false;
        }
      } else {
        const signature = await (typed
          ? signer.signTypedData(typed.domain, typed.types, typed.message)
          : signer.signMessage(messageBytes!));
        assertCurrent();
        request.resolve({ id: request.request.topic, payload: signature as HexString });
      }

      // The dApp already has the hash or signature, so nothing after this point may report a failure:
      // the user would retry and pay twice. Opening the linked keys again is only housekeeping, and a
      // linked key that still needs its own password (Account access) is left as it is.
      for (const linkedAddress of [substrateAddress, ethereumAddress]) {
        try {
          this.state.keyringService.unlockPair(linkedAddress);
        } catch {
          // Listed in Account access until the user unlocks it.
        }
      }

      return true;
    } finally {
      handler.releaseWCSignRequest(request);
    }
  }

  wcRequestReject({ approvalId }: RequestRejectWalletConnect) {
    return this.state.requestService.evmRequestHandler.rejectWCSignRequest(approvalId);
  }

  private WCNotSupportSubscribe(id: string, port?: chrome.runtime.Port): WalletConnectNotSupportRequest[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(walletConnect.requests.notSupport.subscribe)'>(
      id,
      port
    );

    const subscription = this.state.requestService.notSupportWCSubject.subscribe(
      (requests: WalletConnectNotSupportRequest[]): void => cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => subscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.allNotSupportWCRequests;
  }

  // private approveWalletConnectNotSupport({ id }: RequestApproveWalletConnectNotSupport): boolean {
  //   const request = this.state.requestService.getNotSupportWCRequest(id);

  //   request.resolve();

  //   return true;
  // }

  private rejectWalletConnectNotSupport({ id }: RequestRejectWalletConnectNotSupport): boolean {
    const request = this.state.requestService.getNotSupportWCRequest(id);

    request.reject(new Error('USER_REJECTED'));

    return true;
  }

  private async walletConnectDappSubscribePairing(uri: string, id: string, port?: Port) {
    return this.state.walletConnectDappService.subscribePairing(uri, id, port);
  }

  private async walletConnectDappPairing(attemptId: string, port?: Port) {
    return this.state.walletConnectDappService.initPairing(attemptId, port);
  }

  private irohaConnectSubscribe(id: string, port?: Port): IrohaConnectSnapshot {
    return subscribeIrohaConnectState(this.state, id, port);
  }

  private get enabledIrohaConnectService() {
    return requireEnabledIrohaConnect(this.state.irohaConnectService);
  }

  async changeMasterPassword(request: RequestChangePassword): Promise<boolean> {
    const success = await this.state.keyringService.changeMasterPassword(request);
    if (success) this.state.keyringLockService.setExtensionAutoLockTimeout();
    return success;
  }

  lockKeyring(skipCheck: boolean): boolean {
    if (!skipCheck && this.state.keyringLockService.lockTimerIsExist()) return false;

    this.state.keyringLockService.clearLockTimer();

    return this.state.keyringService.lockKeyring();
  }

  async unlockKeyring(request: RequestUnlockExtension): Promise<boolean | 'ton-recovery-required' | 'ton-storage-unavailable'> {
    const isSuccess = this.state.keyringService.unlockKeyring(request as RequestUnlockExtension);
    if (isSuccess) {
      await this.state.keyringService.waitForPasswordVerifierUpgrade();
      this.state.keyringLockService.setExtensionAutoLockTimeout();
    }

    return isSuccess && this.state.keyringService.tonKeyring.hasStorageIssues
      ? 'ton-storage-unavailable'
      : isSuccess;
  }

  async handle<TMessageType extends MessageTypes>(
    id: string,
    type: TMessageType,
    request: RequestTypes[TMessageType],
    port?: Port
  ): Promise<ResponseType<TMessageType>> {
    this.state.keyringLockService?.lockIfExpired();
    // Reset retains live keys until storage succeeds, but another popup must
    // not use that recovery window to export, sign or mutate the wallet.
    if (this.state.keyringService.isResetting &&
      type !== 'pri(keyring.reset)' && type !== 'pri(app.port.ping)' && type !== 'pri(app.isReady)')
      throw new Error('Wallet reset is in progress');
    switch (type) {
      // App Management, networks
      case 'pri(app.port.ping)':
        return true;

      case 'pri(app.isReady)':
        return this.state.isReady();

      case 'pri(networkMap.upsert)':
        return this.upsertNetworkMap(request as NetworkMapEdit);

      case 'pri(networkMap.toggle.favorite)':
        return this.toggleNetworkFavorite(request as string | { networkName: string; address: string; favorite?: boolean });

      case 'pri(window.open)':
        return this.windowOpen(request as string);

      // keyring
      case 'pri(keyring.hasMasterPassword)':
        return this.state.keyringService.hasMasterPassword;

      case 'pri(keyring.hasAccounts)':
        return this.state.keyringService.hasAccounts;

      case 'pri(keyring.keyringIsLocked)':
        return this.state.keyringService.keyringIsLocked;

      case 'pri(keyring.subscribeLock)': {
        const notify = this.state.subscriptionService.createSubscription<'pri(keyring.subscribeLock)'>(id, port);
        const subscription = this.state.keyringService.lockSubject.subscribe(() => notify(true));
        this.state.subscriptionService.setUnsubscriptionHandle(id, () => subscription.unsubscribe());
        port?.onDisconnect.addListener(() => this.cancelSubscription(id));
        return this.state.keyringService.keyringIsLocked;
      }

      case 'pri(keyring.changePassword)':
        return this.changeMasterPassword(request as RequestChangePassword);

      case 'pri(keyring.unlock)':
        return this.unlockKeyring(request as RequestUnlockExtension);

      case 'pri(keyring.lock)':
        return this.lockKeyring(request as boolean);

      case 'pri(keyring.getPassword)':
        return this.state.keyringService.getPassword();

      case 'pri(keyring.reset)':
        return this.state.keyringService.resetWallet(async () => {
          await this.state.requestService.resetWallet();
          await this.state.walletConnectDappService.resetWallet();
          await this.state.walletConnectService.resetWallet();
          await this.state.setCurrentAccount(null);
        });

      case 'pri(keyring.getAccessStatus)':
        return this.state.keyringService.getAccessStatus();

      case 'pri(keyring.getMigrationAccounts)':
        return this.state.keyringService.getMigrationAccounts();

      case 'pri(keyring.isNeedMigration)':
        return this.state.keyringService.isNeedMigration();

      case 'pri(keyring.deferLegacyPasswordMigration)':
        return this.state.keyringService.deferLegacyPasswordMigration();

      case 'pri(keyring.recoverAccountWithPassword)':
        return this.state.keyringService.recoverAccountWithPassword(request as RequestRecoverAccountWithPassword);

      case 'pri(keyring.recoverAccountWithPhrase)':
        return this.state.keyringService.recoverAccountWithPhrase(request as RequestRecoverAccountWithPhrase);

      case 'pri(keyring.getUniversalWalletMigrationSnapshot)':
        return this.state.keyringService.getUniversalWalletMigrationSnapshot();

      case 'pri(keyring.migrateMasterPassword)':
        return this.state.keyringService.keyringMigrateMasterPassword(request as RequestMigratePassword);

      case 'pri(keyring.export.mnemonic)':
        return this.state.keyringService.exportAccountMnemonic(request as RequestExportSeed);

      case 'pri(keyring.export.rowSeed)':
        return this.state.keyringService.accountExportRawSeed(request as RequestExportSeed);

      case 'pri(keyring.export.rawSeedAvailable)':
        return this.state.keyringService.accountRawSeedAvailable(request as RequestTypes['pri(keyring.export.rawSeedAvailable)']);

      case 'pri(keyring.generateMnemonic)':
        return this.state.keyringService.mnemonicGenerate(request as RequestGenerateMnemonic);

      case 'pri(keyring.mnemonicValidate)':
        return this.state.keyringService.mnemonicValidate(request as RequestValidateMnemonic);

      case 'pri(keyring.tonImportCandidates)':
        return this.tonImportCandidates(request as RequestTonImportCandidates);

      case 'pri(networkMap.getSubscription)':
        return this.subscribeNetworkMap(id, port);

      case 'pri(selectedNetworks.getSubscription)':
        return this.subscribeSelectedNetworks(id, port);

      // authorize
      case 'pri(authorize.approve)':
        return this.authorizeApprove(request as RequestAuthorizeApprove);

      case 'pri(authorize.list)':
        return this.getAuthList();

      case 'pri(authorize.remove)':
        return this.removeAuthorization(request as string);

      case 'pri(authorize.delete.request)':
        return this.deleteAuthRequest(request as string);

      case 'pri(authorize.cancel)':
        return this.cancelAuthRequest(request as string);

      case 'pri(authorize.requests)':
        return this.authorizeSubscribe(id, port);

      case 'pri(authorize.update)':
        return this.authorizeUpdate(request as RequestUpdateAuthorizedAccounts);

      // accounts
      case 'pri(accounts.create.mobile)':
        return this.createMobileWallet(request as RequestAddressCreate);

      case 'pri(accounts.validate.path)':
        return this.validateDerivationPath(request as DerivationPath);

      case 'pri(accounts.create)':
        return this.accountsCreate(request as RequestAccountCreateSuri);

      case 'pri(accounts.update.current)':
        return this.state.updateCurrentAccount(request as RequestUpdateCurrentAccount, false);

      case 'pri(accounts.update.currentNetwork)':
        return this.state.setActiveNetworks(request as string);

      case 'pri(accounts.update.meta)':
        return this.updatePairMeta(request as RequestUpdateMeta);

      case 'pri(accounts.export.json)':
        return this.exportJSON(request as RequestAccountExport);

      case 'pri(migrate.export.json)':
        return this.migrateExportJSON(request as string);

      case 'pri(accounts.forget)':
        return this.accountsForget(request as RequestAccountForget);

      case 'pri(accounts.recovery.list)':
        return new WalletRecoveryRecords().inventory();
      case 'pri(accounts.recovery.export)':
        return new WalletRecoveryRecords().export();
      case 'pri(accounts.deleted.list)':
        return this.state.keyringService.getDeletedWallets();

      case 'pri(accounts.deleted.restore)':
        return this.restoreDeletedWallet(request as RequestRestoreDeletedWallet);

      case 'pri(accounts.subscribe)':
        return this.accountsSubscribe(id, port);

      case 'pri(accounts.name)':
        return this.accountUpdateName(request as RequestAccountName);

      case 'pri(accounts.json.restore)':
        return this.jsonRestore(request as RequestJsonRestore);

      case 'pri(accounts.json.valid)':
        return this.jsonValid(request as RequestJsonRestore);

      case 'pri(accounts.validate)':
        return this.accountsValidatePassword(request as RequestAccountValidate);

      case 'pri(accounts.totalBalances)':
        return this.state.balanceService.getTotalBalances(request as RequestTotalBalances | null);

      case 'pri(accounts.portfolioHoldings)':
        // Read only, and only for a build that carries the dashboard (src/portfolio/dashboard/dashboardFlag.ts): a
        // release answers it like any message it does not know.
        if (process.env.FW_PORTFOLIO_DASHBOARD !== 'true') throw new Error(`Unable to handle message of type ${type}`);

        return this.state.balanceService.getPortfolioHoldings(request as RequestPortfolioHoldings | null);

      case 'pri(accounts.getHistory)':
        return this.state.historyService.fetchTonAssetsHistory(request as RequestGetHistory);

      /// Transfer, CrossChain, Sora Swap
      case 'pri(accounts.checkTransfer)':
        return this.checkTransfer(request as RequestCheckTransfer);

      case 'pri(accounts.makeTransfer)':
        return this.makeTransfer(id, request as RequestTransfer, port);

      case 'pri(accounts.checkCrossChain)':
        return this.checkCrossChain(request as RequestCheckCrossChain);

      case 'pri(accounts.makeCrossChain)':
        return this.makeCrossChain(id, request as RequestCrossChain, port);

      case 'pri(accounts.checkSwap)':
        return this.checkSwap(request as RequestCheckSwap);

      case 'pri(accounts.makeSwap)':
        return this.makeSwap(request as RequestSwap);

      case 'pri(policy.soraDisclaimer.status)':
        return this.state.soraDisclaimerService.status;

      case 'pri(policy.soraDisclaimer.accept)':
        return this.state.soraDisclaimerService.accept((request as { version: number }).version);

      case 'pri(security.legacyExposure.status)':
        return this.state.legacyExposureService.getStatus();

      case 'pri(security.legacyExposure.acknowledge)':
        return this.state.legacyExposureService.acknowledge();

      case 'pri(security.legacyExposure.update)':
        return this.state.legacyExposureService.update(request as RequestUpdateLegacyExposure);

      case 'pri(accounts.soraFees.subscribe)':
        return this.soraFeesSubscribe(id, port);

      case 'pri(defi.polkamarkt.snapshot)':
        return this.getPolkamarktSnapshot(request as { marketId?: string });

      case 'pri(defi.polkamarkt.quote)':
        return this.getPolkamarktQuote(request as PolkamarktQuoteRequest);

      case 'pri(defi.polkamarkt.mutate)':
        return this.mutatePolkamarkt(request as PolkamarktMutationRequest);

      case 'pri(accounts.checkScamAddress)':
        return this.checkScamAddress(request as RequestCheckScam);

      // staking
      case 'pri(staking.stakingParams)':
        return this.state.stakingService.getStakingParams(request as StakingParamsRequest);

      case 'pri(staking.checkController)':
        return this.checkController(request as CheckControllerRequest);

      case 'pri(staking.rewards)':
        return this.state.stakingService.getRewards(request as getRewardsRequest);

      case 'pri(staking.myStaking)':
        return this.getMyStakingInfo(request as StakingNetworkRequest);

      case 'pri(staking.makeStaking)':
        return this.makeStaking(request as MakeStakingRequest);

      case 'pri(staking.getPayoutsFee)':
        return this.state.stakingService.getPayoutsFee(request as GetPayoutsFeeRequest);

      case 'pri(staking.getNominateNetworkFee)':
        return this.state.stakingService.getNominateNetworkFee(request as GetNominateNetworkFeeRequest);

      case 'pri(staking.getBondAndNominateNetworkFee)':
        return this.state.stakingService.getBondAndNominateNetworkFee(request as RequestBond);

      // pools
      case 'pri(pools.poolsParams)':
        return this.state.poolsService.getPoolsParams(request as PoolsParamsRequest);

      case 'pri(pools.makePool)':
        return this.makePool(request as MakePoolsRequest);

      case 'pri(pools.shareOfPool)':
        return this.getShareOfPool(request as GetShareOfPoolRequest);

      case 'pri(pools.unsubscribePools)':
        return this.state.poolsService.unsubscribePools();

      case 'pri(pools.accountLiquidity)':
        return this.state.poolsService.accountLiquiditySubscribe(id, port);

      case 'pri(pools.getAmountValue)':
        return this.state.poolsService.getPoolAmountValue(request as DefaultPoolParams);

      case 'pri(pools.demeter.get)':
        return this.state.poolsService.getDemeterPools();

      case 'pri(pools.demeter.mutate)':
        return this.mutateDemeter(request as DemeterMutationRequest);

      // price
      case 'pri(price.update.currency)':
        return this.updateCurrencySymbol(request as string);

      case 'pri(price.subscription)':
        return this.subscribePrice(id, port);

      case 'pri(price.getFiats)':
        return this.state.pricesService.getFiats();

      // metadata
      case 'pri(metadata.approve)':
        return this.metadataApprove(request as RequestMetadataApprove);

      case 'pri(metadata.reject)':
        return this.metadataReject(request as RequestMetadataReject);

      case 'pri(metadata.requests)':
        return this.metadataSubscribe(id, port);

      // tabs, tab
      case 'pri(tabs.update.activeTabsUrl)':
        return this.updateCurrentTabs(request as RequestActiveTabsUrlUpdate);

      case 'pri(tab.status)':
        return this.isTabAuthorize();

      // signing
      case 'pri(signing.approve)':
        return this.signingApprove(request as RequestSigningApprove);

      case 'pri(signing.approve.signature)':
        return this.signingApproveSignature(request as RequestSigningApproveSignature);

      case 'pri(signing.cancel)':
        return this.signingCancel(request as RequestSigningCancel);

      case 'pri(signing.requests)':
        return this.signingSubscribe(id, port);

      case 'pri(signing.evmRequests)':
        return this.signingEvmSubscribe(id, port);

      case 'pri(signing.solanaRequests)':
        return this.signingSolanaSubscribe(id, port);

      // google
      case 'pri(google.get.files)':
        return this.state.googleService.getFiles(request as RequestGoogleToken);

      case 'pri(google.verify.token)':
        return this.state.googleService.verifyToken(request as RequestGoogleToken);

      case 'pri(google.auth)':
        return this.state.googleService.authExtension(request as GoogleAuthTypes);

      case 'pri(google.get.file)':
        return this.state.googleService.getFile(request as GoogleFileId);

      case 'pri(google.create.file)':
        return this.state.googleService.createFile(request as ICreateFile);

      case 'pri(google.delete.file)':
        return this.state.googleService.deleteFile(request as GoogleFileId);

      // balance
      case 'pri(balance)':
        return this.state.balanceService.getBalance();

      case 'pri(fetch.evm.balance)':
        return this.fetchEvmBalance(request as FetchBalancePayload);

      case 'pri(balance.subscription)':
        return this.subscribeBalance(id, port);

      case 'pri(fetch.balance)':
        return this.fetchBalance(request as FetchBalanceRequest);

      case 'pri(asset.discovery.sweep)':
        return this.state.assetDiscoverySweepService.runIfDue({ force: true });

      //Wallet Connect
      case 'pri(walletConnect.connect)':
        return this.connectWalletConnect(request as RequestConnectWalletConnect);

      case 'pri(walletConnect.requests.connect.subscribe)':
        return this.connectWCSubscribe(id, port);

      case 'pri(walletConnect.session.approve)':
        return this.approveWalletConnectSession(request as RequestApproveConnectWalletSession);

      case 'pri(walletConnect.session.reject)':
        return this.rejectWalletConnectSession(request as RequestRejectConnectWalletSession);

      case 'pri(walletConnect.session.subscribe)':
        return this.subscribeWalletConnectSessions(id, port);

      case 'pri(walletConnect.session.disconnect)':
        return this.disconnectWalletConnectSession(request as RequestDisconnectWalletConnectSession);

      case 'pri(walletConnect.request.approve)':
        return this.wcRequestApprove(request as RequestApproveWalletConnect);

      case 'pri(walletConnect.request.reject)':
        return this.wcRequestReject(request as RequestRejectWalletConnect);

      case 'pri(walletConnect.signing.requests.subscribe)':
        return this.wcSigningSubscribe(id, port);

      // Not support
      case 'pri(walletConnect.requests.notSupport.subscribe)':
        return this.WCNotSupportSubscribe(id, port);

      case 'pri(walletConnect.notSupport.reject)':
        return this.rejectWalletConnectNotSupport(request as RequestRejectWalletConnectNotSupport);

      // WalletConnect mobilewallet
      case 'pri(walletConnect.app.subscribePairing)':
        return this.walletConnectDappSubscribePairing(request as string, id, port);

      case 'pri(walletConnect.app.pairing)':
        return this.walletConnectDappPairing(request as string, port);

      case 'pri(walletConnect.app.cancelPairing)':
        return this.state.walletConnectDappService.abortPairingAttempt(request as string, port);

      // IrohaConnect wallet relay
      case 'pri(irohaConnect.connect)':
        return this.enabledIrohaConnectService.connect((request as IrohaConnectStartRequest).uri);

      case 'pri(irohaConnect.subscribe)':
        return this.irohaConnectSubscribe(id, port);

      case 'pri(irohaConnect.session.approve)':
        return this.enabledIrohaConnectService.approveSession((request as IrohaConnectAccountRequest).accountId);

      case 'pri(irohaConnect.session.reject)':
        return this.enabledIrohaConnectService.rejectSession();

      case 'pri(irohaConnect.request.approve)':
        return this.enabledIrohaConnectService.approveRequest((request as IrohaConnectPendingRequest).requestId);

      case 'pri(irohaConnect.request.reject)':
        return this.enabledIrohaConnectService.rejectRequest((request as IrohaConnectPendingRequest).requestId);

      case 'pri(irohaConnect.disconnect)':
        return this.enabledIrohaConnectService.disconnect();

      case 'pri(irohaConnect.error.clear)':
        return this.enabledIrohaConnectService.clearError();

      // OnBoarding
      case 'pri(onboarding.getStories)':
        return this.state.onboardingService.getStories(request as string);

      case 'pri(onboarding.setComplete)':
        return this.state.onboardingService.setComplete();

      case 'pri(onboarding.isRequired)':
        return this.state.onboardingService.isRequired;

      // Nfts
      case 'pri(nft.subscribe)':
        return this.state.nftService.nftSubscribe(id, port);

      case 'pri(nft.fetch)':
        return this.state.nftService.fetchNfts(request as string);

      case 'pri(nft.send)':
        return this.state.nftService.sendNft(request as RequestNftTransfer);

      case 'pri(nft.checkSend)':
        return this.state.nftService.checkSend(request as NftTx);

      case 'pri(nft.fetchNftsForContract)':
        return this.state.nftService.availableNftsForContract(request as AvailableNftPayload);

      case 'pri(nft.settings)':
        return this.state.nftService.changeSettings(request as RequestSettingsChangePayload);

      // popup
      case 'pri(popup.getIds)':
        return this.state.requestService.popupHandler.popup;

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
