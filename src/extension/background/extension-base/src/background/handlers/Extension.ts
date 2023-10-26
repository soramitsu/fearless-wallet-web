import { api as apiSora, FPNumber } from '@sora-substrate/util';
import { ALLOWED_PATH, PASSWORD_EXPIRY_MS } from '@extension-base/defaults';
import { hexToU8a, isHex, assert } from '@polkadot/util';
import { isEthereumAddress, base64Decode } from '@polkadot/util-crypto';
import { createPair } from '@polkadot/keyring';
import { ethers, Wallet } from 'ethers';
import { getEVMTransactionObject, makeEVMTransfer } from '@extension-base/api/evm/transfer';
import { estimateFee, makeTransfer } from '@extension-base/api/substrate/transfer';
import { createSwap } from '@extension-base/api/substrate/swaps';
import { withErrorLog } from '@extension-base/background/handlers/helpers';
import State, { registry } from '@extension-base/background/handlers/State';
import { createSubscription, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import FWExtensionBase from '@extension-base/background/handlers/ExtensionBase';
import { getInternalError } from '@walletconnect/utils';

import { makeCrossChain, estimateCrossChainFee } from '@extension-base/api/substrate/crossChain';
import {
  getSubstrateAddress,
  isRequireEvmAPI,
  uniqueStringArray,
  getBalanceItem,
  getTokenBalance,
  getEthereumAddress,
} from '@extension-base/background/utils/utils';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { addresses as addressesObservable } from '@polkadot/ui-keyring/observable/addresses';
import { ProposalTypes, SessionTypes } from '@walletconnect/types';
import { HexString } from '@polkadot/util/types';
import { storage } from '@extension-base/stores/Storage';
import { MetadataDef } from '@polkadot/extension-inject/types';
import { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import { BasicTxErrorCode, RequestUpdateMeta, TransferErrorCode } from '@extension-base/background/types';
import {
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
} from '../../services/wallet-connect-service/consts';
import {
  RequestConnectWalletConnect,
  WalletConnectSessionRequest,
  RequestApproveConnectWalletSession,
  ResultApproveWalletConnectSession,
  RequestRejectConnectWalletSession,
  RequestDisconnectWalletConnectSession,
  WalletConnectTransactionRequest,
  RequestApproveWalletConnect,
  WalletConnectNotSupportRequest,
  RequestApproveWalletConnectNotSupport,
  RequestRejectWalletConnectNotSupport,
  EIP155_SIGNING_METHODS,
} from '../../services/wallet-connect-service/types';
import {
  isProposalExpired,
  isSupportWalletConnectNamespace,
  isSupportWalletConnectChain,
  convertHexToUtf8,
} from '../../services/wallet-connect-service/utils';
import type {
  BasicTxResponse,
  NotificationResponse,
  ResponseCheckTransfer,
  SigningRequest,
} from '@extension-base/background/types/types';
import type {
  MobileSigningRequest,
  RequestMobileSign,
  ActiveTabAuthorizeStatus,
  BalanceJson,
  BasicTxError,
  Port,
  PriceJson,
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
  AllowedPath,
  AuthorizedAccountsDiff,
  AuthorizeRequest,
  GoogleFileId,
  MessageTypes,
  MetadataRequest,
  RequestAccountCreateSuri,
  RequestAccountExport,
  RequestAccountForget,
  RequestAccountName,
  RequestAccountValidate,
  RequestActiveTabsUrlUpdate,
  RequestAddressCreate,
  RequestAuthorizeApprove,
  RequestJsonRestore,
  RequestMetadataApprove,
  RequestMetadataReject,
  RequestSigningApprovePassword,
  RequestSigningApproveSignature,
  RequestSigningCancel,
  RequestSigningIsLocked,
  RequestTypes,
  RequestUpdateAuthorizedAccounts,
  ResponseAuthorizeList,
  ResponseType,
} from '@extension-base/background/types';

import type { CurrentAccountInfo, CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import type { NetworkJson } from '@extension-base/types';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import { LIQUID_SOURCE_FOR_MARKET } from '@/consts/currencies';
import { ALL_NETWORKS } from '@/consts/networks';
import { googleManage } from '@/controllers/googleController';
import {
  DerivationPath,
  FilesResponse,
  GoogleAuthTypes,
  ICreateFile,
  IGetFilesResponse,
  OnboardingStories,
  SoraFees,
  VerifyTokenResponse,
} from '@/interfaces';

function isJsonPayload(value: SignerPayloadJSON | SignerPayloadRaw): value is SignerPayloadJSON {
  return (value as SignerPayloadJSON).genesisHash !== undefined;
}

async function transformAccounts(accounts: SubjectInfo, state: State): Promise<AccountJson[]> {
  const currentAccount = await state.currentAccount;

  const transformedAccounts = Object.values(accounts)
    .filter((el) => !isEthereumAddress(el.json.address))
    .map(({ json: { address, meta }, type }): AccountJson => {
      const isDefault = address === currentAccount?.address;
      const currentNetwork = state.selectedNetworks[address] ?? ALL_NETWORKS;

      return {
        address,
        ethereumAddress: meta.ethereumAddress as string,
        active: isDefault,
        name: meta.name ?? '',
        type,
        network: currentNetwork,
        ...meta,
      };
    });

  return transformedAccounts;
}

export default class Extension extends FWExtensionBase {
  constructor(state: State) {
    super(state);
  }

  private cancelSubscription(id: string): boolean {
    return this.state.cancelSubscription(id);
  }

  public updateNetworkForNewWallet(address: string) {
    this.setActiveNetworks(this.state.selectedNetworks[address] ?? ALL_NETWORKS);
  }

  accountsCreate({ password, suri, type, meta }: RequestAccountCreateSuri): string {
    const address = this.state.keyringService.addAccount(suri, password, { ...meta, isMobile: false }, type);

    if (!isEthereumAddress(address)) this.updateCurrentAccount(address);

    return address;
  }

  async accountsForget({ address, type }: RequestAccountForget): Promise<boolean> {
    const authorizedAccountsDiff: AuthorizedAccountsDiff = [];

    // cycle through authUrls and prepare the array of diff
    this.state.requestService.getAuthorize((authUrls) => {
      Object.entries(authUrls).forEach(([url, urlInfo]) => {
        if (!urlInfo.authorizedAccounts.includes(address)) {
          return;
        }

        authorizedAccountsDiff.push([
          url,
          urlInfo.authorizedAccounts.filter((previousAddress) => previousAddress !== address),
        ]);
      });
    });

    this.state.updateAuthorizedAccounts(authorizedAccountsDiff);

    //  cycle through default account selection for auth and remove any occurence of the account
    if (!isEthereumAddress(address)) {
      const newDefaultAuthAccounts = this.state.defaultAuthAccountSelection.filter(
        (defaultSelectionAddress) => defaultSelectionAddress !== address
      );

      this.state.updateDefaultAuthAccounts(newDefaultAuthAccounts);
    }

    if (type === 'native') {
      const pair = this.state.keyringService.getAccount(address);
      const ethereumAddress = pair?.meta.ethereumAddress as string | undefined;

      if (ethereumAddress) {
        this.state.keyringService.forgetAccount(ethereumAddress);
      }

      this.state.walletConnectService.sessions.forEach((session) => {
        const evm = session.namespaces['eip155'] ?? [];

        if (evm) {
          const [, , evmAddress] = evm.accounts[0].split(':');

          if (ethereumAddress && ethereumAddress.toLowerCase() === evmAddress.toLowerCase()) {
            return this.state.walletConnectService.disconnect(session.topic);
          }
        }

        const polakdot = session.namespaces['polkadot'];

        if (polakdot) {
          const [, , substaddress] = polakdot.accounts[0].split(':');

          if (substaddress.toLowerCase() === address.toLowerCase()) {
            this.state.walletConnectService.disconnect(session.topic);
          }
        }
      });
      this.state.keyringService.forgetAccount(address);
    } else this.state.keyringService.forgetAddress(address);

    const accounts = this.state.keyringService.getAccounts();
    const addresses = this.state.keyringService.getAddresses();

    const currentAccount = await this.state.currentAccount;

    const isWasCurrentAccount = address === currentAccount?.address;

    if (isWasCurrentAccount) {
      let account;

      if (accounts.length) account = accounts.find(({ address }) => !isEthereumAddress(address))!;
      else if (addresses.length) account = addresses[0];

      this.updateCurrentAccount(account?.address ?? '');
    }

    this.cleanupDeletedAccount(address);

    return true;
  }

  cleanupDeletedAccount(address: string) {
    if (this.state.selectedNetworks[address]) {
      delete this.state.selectedNetworks[address];

      storage.set({ selectedNetworks: this.state.selectedNetworks });
    }

    if (this.state.balanceMap[address]) delete this.state.balanceMap[address];
  }

  accountsValidatePassword({ address, password }: RequestAccountValidate): boolean {
    try {
      this.state.keyringService.backupAccount(address, password);

      return true;
    } catch (e) {
      return false;
    }
  }

  async addressesSubscribe(id: string, port: Port): Promise<AccountJson[]> {
    const cb = createSubscription<'pri(addresses.subscribe)'>(id, port);

    const transformedAddresses = transformAccounts(addressesObservable.subject.value, this.state);

    const subscription = addressesObservable.subject.subscribe((addresses: SubjectInfo): void => {
      transformAccounts(addresses, this.state).then(cb);
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return transformedAddresses;
  }

  async accountsSubscribe(id: string, port: Port): Promise<AccountJson[]> {
    const cb = createSubscription<'pri(accounts.subscribe)'>(id, port);

    const transformedAccounts = transformAccounts(accountsObservable.subject.value, this.state);

    const subscription = accountsObservable.subject.subscribe((accounts: SubjectInfo): void => {
      transformAccounts(accounts, this.state).then(cb);
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return transformedAccounts;
  }

  authorizeApprove({ authorizedAccounts, id }: RequestAuthorizeApprove): boolean {
    const queued = this.state.requestService.getAuthRequest(id);

    assert(queued, 'Unable to find request');

    const { resolve } = queued;
    resolve({ authorizedAccounts, result: true });

    return true;
  }

  mobileSignApprove({ signature, id }: RequestMobileSign): boolean {
    const queued = this.state.getMobileSignRequest(id);

    assert(queued, 'Unable to find request');

    const { resolve } = queued;
    resolve({ signature, id });

    return true;
  }

  async authorizeUpdate({ authorizedAccounts, url }: RequestUpdateAuthorizedAccounts): Promise<void> {
    return this.state.updateAuthorizedAccounts([[url, authorizedAccounts]]);
  }

  async getAuthList(): Promise<ResponseAuthorizeList> {
    const list = await this.state.requestService.getAuthList();

    return { list };
  }

  async isTabAuthorize(): Promise<ActiveTabAuthorizeStatus> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
        if (!tab || !tab.url) {
          return resolve({
            isAuthorize: false,
            authorizeAccountsCount: 0,
            dAppName: '',
          });
        }

        const tabHostName = new URL(tab.url).hostname;
        this.state.requestService.getAuthorize((authUrls) => {
          const authorizeUrl = Object.keys(authUrls).filter((url) => url === tabHostName);
          const isAuthorize = authorizeUrl.length !== 0;

          resolve({
            isAuthorize,
            authorizeAccountsCount: isAuthorize ? authUrls[tabHostName].authorizedAccounts.length : 0,
            dAppName: tabHostName,
          });
        });
      });
    });
  }

  authorizeSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(authorize.requests)'>(id, port);

    const subscription = this.state.requestService.authSubject.subscribe((requests: AuthorizeRequest[]): void =>
      cb(requests)
    );

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
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

  metadataSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(metadata.requests)'>(id, port);

    const subscription = this.state.requestService.metaSubject.subscribe((requests: MetadataRequest[]): void =>
      cb(requests)
    );

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  private validatePassword(json: KeyringPair$Json, password: string): boolean {
    const cryptoType = Array.isArray(json.encoding.content) ? json.encoding.content[1] : 'ed25519';
    const encType = Array.isArray(json.encoding.type) ? json.encoding.type : [json.encoding.type];
    const pair = createPair(
      { toSS58: this.encodeAddress, type: cryptoType as KeypairType },
      { publicKey: this.decodeAddress(json.address, true) },
      json.meta,
      isHex(json.encoded) ? hexToU8a(json.encoded) : base64Decode(json.encoded),
      encType
    );

    // unlock then lock (locking cleans secretKey, so needs to be last)
    try {
      if (password) {
        pair.decodePkcs8(password);
        pair.lock();
      }

      return true;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  jsonRestore({ file, password }: RequestJsonRestore): Promise<string> {
    const isPasswordValidated = this.validatePassword(file, password);

    if (isPasswordValidated) {
      return new Promise((resolve, reject) => {
        try {
          const { address } = this.state.keyringService.restoreAccount(file, password);

          if (!isEthereumAddress(address)) this.updateNetworkForNewWallet(address);

          this.updateCurrentAccount(address);

          resolve(address);
        } catch (error) {
          reject({ error: (error as Error).message });
        }
      });
    } else {
      throw new Error('Unable to decode using the supplied passphrase');
    }
  }

  private async setActiveNetworks(type: string): Promise<void> {
    this.state.setActiveNetworks(type);
  }

  private async toggleNetworkFavorite(networkKey: string): Promise<void> {
    await this.state.setFavoriteNetwork(networkKey);
  }

  private async upsertNetworkMap(data: NetworkJson): Promise<boolean> {
    try {
      return this.state.upsertNetworkMap(data);
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  private _saveCurrentAccountAddress(address: string, callback?: (account: CurrentAccountState) => void) {
    if (address === '') {
      this.state.setCurrentAccount(null);

      return;
    }

    const {
      meta: { isMobile, name, ethereumAddress },
    } = this.state.keyringService.getAccount(address) ?? this.state.keyringService.getAddress(address)!;

    const accountInfo: CurrentAccountInfo = {
      address,
      isMobile: !!(isMobile as boolean),
      name: name as string,
      ethereumAddress: (ethereumAddress as string) ?? '',
    };

    this.state.setCurrentAccount(accountInfo, () => callback?.(accountInfo));
  }

  private triggerWalletsSubscription(): boolean {
    const accountsSubject = accountsObservable.subject;
    const addressSubject = addressesObservable.subject;

    accountsSubject.next(accountsSubject.getValue());
    addressSubject.next(addressSubject.getValue());

    return true;
  }

  private updateCurrentAccount(address: string, isNew = true): boolean {
    if (isEthereumAddress(address)) return false;

    this.state.generateDefaultBalance(address);

    this._saveCurrentAccountAddress(address, () => {
      this.triggerWalletsSubscription();

      if (isNew) this.updateNetworkForNewWallet(address);
    });

    return true;
  }

  signingApprovePassword({ id, password, savePass }: RequestSigningApprovePassword): boolean {
    const queued = this.state.requestService.getSignRequest(id);

    assert(queued, 'Unable to find request');

    const { reject, request, resolve } = queued;
    const pair = this.state.keyringService.getPair(queued.account.address);

    if (!pair) {
      reject(new Error('Unable to find pair'));

      return false;
    }

    const { address } = pair;

    this.refreshAccountPasswordCache(pair);

    // if the keyring pair is locked, the password is needed
    if (pair.isLocked) {
      if (!password) {
        reject(new Error('Password needed to unlock the account'));

        return false;
      }

      pair.decodePkcs8(password);
    }

    const { payload } = request;

    if (isJsonPayload(payload)) {
      // Get the metadata for the genesisHash
      const currentMetadata = this.state.knownMetadata.find(
        (meta: MetadataDef) => meta.genesisHash === payload.genesisHash
      );

      // set the registry before calling the sign function
      registry.setSignedExtensions(payload.signedExtensions, currentMetadata?.userExtensions);

      if (currentMetadata) registry.register(currentMetadata?.types);
    }

    const result = request.sign(registry, pair);

    if (savePass) this.cachedUnlocks[address] = Date.now() + PASSWORD_EXPIRY_MS;
    else pair.lock();

    resolve({ id, ...result });

    return true;
  }

  signingApproveSignature({ id, signature }: RequestSigningApproveSignature): boolean {
    this.state.signature = signature;

    const queued = this.state.requestService.getSignRequest(id);

    assert(queued, 'Unable to find request');

    queued.resolve({ id, signature });

    return true;
  }

  signingCancel({ id }: RequestSigningCancel): boolean {
    const queued = this.state.requestService.getSignRequest(id);

    assert(queued, 'Unable to find request');

    queued.reject(new Error('Cancelled'));

    return true;
  }

  mobileSigningCancel({ id }: RequestSigningCancel): boolean {
    const queued = this.state.getMobileSignRequest(id);

    assert(queued, 'Unable to find request');

    queued.reject(new Error('Cancelled'));

    return true;
  }

  signingSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(signing.requests)'>(id, port);

    const subscription = this.state.requestService.signSubject.subscribe((requests: SigningRequest[]): void =>
      cb(requests)
    );

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  mobileSigningSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(mobileSigning.tx)'>(id, port);

    const subscription = this.state.mobileSignSubject.subscribe((req: MobileSigningRequest[]): void => cb(req));

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  async windowOpen(path: AllowedPath): Promise<boolean> {
    const [tab] = await chrome.tabs.query({ title: 'fearless-wallet' });

    if (tab && tab.id) {
      chrome.tabs.update(tab.id, { active: true });

      return true;
    }

    const url = `${chrome.runtime.getURL(`popup.html#${path}`)}`;

    if (!ALLOWED_PATH.includes(path)) {
      console.error('Not allowed to open the url:', url);

      return false;
    }

    withErrorLog(() => chrome.tabs.create({ url }));

    return true;
  }

  async removeAuthorization(url: string): Promise<ResponseAuthorizeList> {
    const auths = await this.state.requestService.getAuthList();
    delete auths[url];
    await this.state.requestService.setAuthorize(auths);
    const newList = await this.state.requestService.getAuthList();

    return { list: newList };
  }

  async deleteAuthRequest(requestId: string): Promise<void> {
    this.state.authorizeCancel({ id: requestId });
  }

  updateCurrentTabs({ tabs }: RequestActiveTabsUrlUpdate) {
    this.state.updateCurrentTabsUrl(tabs);
  }

  initAuth({ type, wallet }: GoogleAuthTypes): void {
    googleManage.authExtension(type, wallet);
  }

  async verifyToken({ token }: { token: string }): Promise<VerifyTokenResponse | null> {
    return googleManage.verifyToken(token);
  }

  getToken(): void {
    chrome.identity.getAuthToken({}, (token) => {
      this.token = token ?? '';
    });
  }

  async getFiles({ token }: { token: string }): Promise<IGetFilesResponse> {
    return googleManage.getFiles(token);
  }

  async getFile({ id, token }: GoogleFileId): Promise<KeyringPair$Json> {
    return googleManage.getFile(id, token);
  }

  async createFile({ json, options, token }: ICreateFile): Promise<FilesResponse> {
    return googleManage.createFile({ json, options, token });
  }

  deleteFile({ id }: GoogleFileId): void {
    if (!this.token) this.getToken();

    googleManage.deleteFile(id, this.token);
  }

  cancelAuthRequest(id: string) {
    this.state.authorizeCancel({ id });
  }

  private createUnsubscriptionHandle(id: string, unsubscribe: () => void): void {
    this.state.createUnsubscriptionHandle(id, unsubscribe);
  }

  private getTotalBalances() {
    return this.state.getTotalBalances();
  }

  private getBalance(): Promise<BalanceJson> {
    return this.state.getBalance();
  }

  private async fetchEvmBalance() {
    this.state.fetchEvmBalance(null);
  }

  private subscribeBalance(id: string, port: Port): Promise<BalanceJson> {
    const cb = createSubscription<'pri(balance.subscription)'>(id, port);

    const balanceSubscription = this.state.balanceSubject.subscribe({
      next: (rs) => {
        cb(rs);
      },
    });

    this.createUnsubscriptionHandle(id, balanceSubscription.unsubscribe);

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
    });

    return this.getBalance();
  }

  private updateCurrencySymbol(symbol: string) {
    this.state.setFiatSymbol(symbol);
    this.state.refreshPrice();
  }

  private getPrice(): Promise<PriceJson> {
    return new Promise<PriceJson>((resolve) => {
      this.state.getPrice((rs: PriceJson) => resolve(rs));
    });
  }

  private subscribePrice(id: string, port: chrome.runtime.Port): Promise<PriceJson> {
    const cb = createSubscription<'pri(price.subscription)'>(id, port);

    const priceSubscription = this.state.subscribePrice().subscribe({
      next: (rs) => {
        cb(rs);
      },
    });

    this.createUnsubscriptionHandle(id, priceSubscription.unsubscribe);

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
    });

    return this.getPrice();
  }

  private makeExtrinsicCallback(
    portCallback: (res: BasicTxResponse) => void,
    cb: () => void
  ): (res: BasicTxResponse) => void {
    return (res: BasicTxResponse) => {
      cb();
      portCallback(res);
    };
  }

  public async getSoraFees() {
    this.state.soraFees = Object.fromEntries(
      Object.entries(apiSora.NetworkFee).map(([nameFee, value]) => [nameFee, FPNumber.fromCodecValue(value).toString()])
    ) as SoraFees;

    return this.state.soraFees;
  }

  private async validateSwap(options: RequestCheckSwap): Promise<ResponseCheckSwap> {
    const { AToB, BToA, amountA, amountB, minMaxValue, providerFee, route, swapOptions } = await createSwap(
      options,
      apiSora,
      this.state
    );

    return {
      swapOptions,
      fee: providerFee,
      AToB,
      BToA,
      amountA,
      amountB,
      minMaxValue,
      route,
    };
  }

  private async makeSwap(options: RequestSwap): Promise<ResponseMakeSwap> {
    const { swapOptions } = await createSwap(options, apiSora, this.state);
    const { password, isSavePass } = options;
    const { isExchangeB, swapDexId, amountA, amountB, slippage, assetA, assetB, marketType } = swapOptions!;
    const errors: Array<BasicTxError> = [];
    const address = await this.state.getAccountAddress();
    const liquiditySource = LIQUID_SOURCE_FOR_MARKET[marketType!];

    const pair = this.state.keyringService.getPair(address)!;

    if (pair?.isLocked) {
      const isUnlock = this.state.keyringService.unlockPair(pair, password);

      if (!isUnlock)
        return { status: false, errors: [{ message: 'Invalid password', code: BasicTxErrorCode.KEYRING_ERROR }] };
    }

    apiSora.shouldPairBeLocked = !isSavePass;

    try {
      await apiSora.swap.execute(assetA, assetB, amountA, amountB, slippage, isExchangeB, liquiditySource, swapDexId);
    } catch (ex) {
      errors.push({
        code: TransferErrorCode.TRANSFER_ERROR,
        message: '',
      });

      console.info(`Swap transaction failed ${ex}`);
    }

    const ethereumAddress = this.state.keyringService.getAccount(address)?.meta.ethereumAddress as string | undefined;

    this.savePass(address, ethereumAddress, !!isSavePass, false);

    return {
      status: true,
      errors,
    };
  }

  validatePairPassword(address: string, password: string | undefined) {
    const substrateAddress = getSubstrateAddress(address, this.state);
    const errors = [] as Array<BasicTxError>;
    const substratePair = this.state.keyringService.getPair(substrateAddress);

    if (password) {
      try {
        if (substratePair) {
          substratePair.unlock(password);

          const { meta } = substratePair;
          const ethereumAddress = meta.ethereumAddress as string | undefined;

          if (ethereumAddress) {
            const pair = this.state.keyringService.getPair(ethereumAddress);

            if (pair) pair.unlock(password);
          }
        }
      } catch (e: any) {
        errors.push({
          code: BasicTxErrorCode.KEYRING_ERROR,
          message: String(e.message),
        });
      }
    } else {
      if (substratePair?.isLocked)
        errors.push({
          code: BasicTxErrorCode.KEYRING_ERROR,
          message: String('Password required to decode encrypted data'),
        });
    }

    return errors;
  }

  private async checkTransfer(request: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
    const { from, networkKey: givenNetwork, to, assetId, relayChain, amount } = request;
    const networkKey = this.state.getNetworkByKey(givenNetwork).name;
    const substrateAddress = getSubstrateAddress(from, this.state);

    const tokenBalance = getTokenBalance(this.state, substrateAddress, assetId, relayChain);
    const balance = getBalanceItem(tokenBalance.balances, networkKey)!;

    let fee = 0;

    // Estimate with EVM API
    if (isRequireEvmAPI(networkKey)) {
      const { fee: feeValue } = await getEVMTransactionObject({
        balance,
        networkKey,
        to,
        from,
        amount: balance?.transferable || '0',
        state: this.state,
      });

      fee = +ethers.formatUnits(feeValue, 18);
    } else {
      // Estimate with DotSama API

      fee = await estimateFee(networkKey, to, amount, tokenBalance, this.state);
    }

    return {
      destEstimateFee: '0',
      estimateFee: fee.toString(),
    };
  }

  private async makeTransfer(id: string, port: Port, request: RequestTransfer): Promise<BasicTxResponse | undefined> {
    const {
      networkKey: givenNetwork,
      from,
      to,
      password,
      assetId,
      isSavePass,
      isMobile,
      relayChain,
      amount = '0',
    } = request;
    const networkKey = this.state.getNetworkByKey(givenNetwork).name;
    const pair = this.state.keyringService.getPair(from);

    if (pair?.isLocked) {
      const isUnlock = this.state.keyringService.unlockPair(pair, password);

      if (!isUnlock) {
        setTimeout(() => this.cancelSubscription(id), 500);

        return { status: false, errors: [{ message: 'Invalid password' }] };
      }
    }

    const substrateAddress = getSubstrateAddress(from, this.state);
    const ethereumAddress = getEthereumAddress(from, this.state);
    const tokenBalance = getTokenBalance(this.state, substrateAddress, assetId, relayChain);
    const balance = getBalanceItem(tokenBalance.balances, networkKey)!;

    const cb = createSubscription<'pri(accounts.transfer)'>(id, port);
    const savePass = () => this.savePass(substrateAddress, ethereumAddress, !!isSavePass, !!isMobile);
    const callback = this.makeExtrinsicCallback(cb, savePass);

    let transferProm: Promise<void> | undefined;

    const params = {
      networkKey,
      from,
      to,
      amount,
      callback,
      state: this.state,
      isSavePass,
      isMobile: !!isMobile,
      password,
      assetId,
      balance,
    };

    if (isRequireEvmAPI(networkKey)) {
      const { privateKey } = this.state.accountExportPrivateKey({ address: from, password });

      transferProm = makeEVMTransfer({
        ...params,
        privateKey,
      });
    } else transferProm = makeTransfer(params);

    try {
      await transferProm;

      console.info(
        `
        Start transfer: ${amount} ${tokenBalance.symbol}
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

      cb({
        status: false,
        errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: (ex as Error).message }],
      });

      setTimeout(() => this.cancelSubscription(id), 500);
    }

    port.onDisconnect.addListener(() => this.cancelSubscription(id));

    return { status: true };
  }

  savePass(address: string, ethereumAddress: string | undefined, isSavePass: boolean, isMobile: boolean) {
    if (isMobile) return;

    if (isSavePass) {
      this.cachedUnlocks[address] = Date.now() + PASSWORD_EXPIRY_MS;

      if (ethereumAddress) this.cachedUnlocks[ethereumAddress] = Date.now() + PASSWORD_EXPIRY_MS;
    } else {
      this.state.keyringService.lockPair(address);
      this.state.passwords[address] = undefined;

      if (ethereumAddress) {
        this.cachedUnlocks[ethereumAddress] = 0;

        this.state.keyringService.lockPair(ethereumAddress);
        this.state.passwords[ethereumAddress] = undefined;
      }
    }
  }

  private async checkCrossChain(request: RequestCheckCrossChain): Promise<ResponseCheckCrossChain> {
    const { from, originNet: originNetKey, destinationNet, to, assetId, relayChain, amount } = request;

    if (destinationNet === '') return { estimateFee: '0', destEstimateFee: '0' };

    const originNet = this.state.getNetworkByKey(originNetKey).name;
    const substrateAddress = getSubstrateAddress(from, this.state);
    const tokenBalance = getTokenBalance(this.state, substrateAddress, assetId, relayChain);

    const [fee, crossChainFee] = await estimateCrossChainFee(
      assetId,
      originNet,
      destinationNet,
      to,
      amount!,
      tokenBalance,
      this.state
    );

    return {
      estimateFee: fee.toString(),
      destEstimateFee: crossChainFee.toString(),
    };
  }

  private async makeCrossChain(id: string, port: Port, request: RequestCrossChain): Promise<BasicTxResponse> {
    const {
      from,
      originNet: originNetKey,
      destinationNet,
      password,
      to,
      assetId,
      isSavePass,
      isMobile,
      relayChain,
      amount = '0',
    } = request;

    const originNet = this.state.getNetworkByKey(originNetKey).name;
    const pair = this.state.keyringService.getPair(from);

    if (pair?.isLocked) {
      const isUnlock = this.state.keyringService.unlockPair(pair, password);

      if (!isUnlock) {
        setTimeout(() => this.cancelSubscription(id), 500);

        return { status: false, errors: [{ message: 'Invalid password' }] };
      }
    }

    const substrateAddress = getSubstrateAddress(from, this.state);
    const ethereumAddress = getEthereumAddress(from, this.state);
    const tokenBalance = getTokenBalance(this.state, substrateAddress, assetId, relayChain);

    const cb = createSubscription<'pri(accounts.crossChain)'>(id, port);
    const savePass = () => this.savePass(substrateAddress, ethereumAddress, !!isSavePass, !!isMobile);
    const callback = this.makeExtrinsicCallback(cb, savePass);

    const transferProm: Promise<void> | undefined = makeCrossChain(
      {
        assetId,
        originNet,
        destinationNet,
        amount,
        from,
        to,
        password,
        isSavePass,
        tokenBalance,
        callback,
      },
      this.state
    );

    try {
      await transferProm;

      console.info(
        `
        Start crossChain: ${amount} ${tokenBalance.symbol}
        [${originNet}] => [${destinationNet}]
        from ${from}
        to ${to}
      `
      );
    } catch (ex) {
      console.error(
        `
        CrossChain error:
        ${ex}
      `
      );

      cb({
        status: false,
        errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: (ex as Error).message }],
      });

      setTimeout(() => this.cancelSubscription(id), 500);
    }

    port.onDisconnect.addListener(() => this.cancelSubscription(id));

    return { status: true };
  }

  private getNetworkMap(): Record<string, NetworkJson> {
    return this.state.networkMap;
  }

  private createMobileWallet({ address, meta }: RequestAddressCreate) {
    this.state.keyringService.saveAddress(address, meta, 'address');

    this.updateCurrentAccount(address);
  }

  private subscribeNetworkMap(id: string, port: Port): Record<string, NetworkJson> {
    const cb = createSubscription<'pri(networkMap.getSubscription)'>(id, port);
    const networkMapSubscription = this.state.subscribeNetworkMap().subscribe({
      next: (rs) => {
        cb(rs);
      },
    });

    this.createUnsubscriptionHandle(id, networkMapSubscription.unsubscribe);

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
    });

    return this.getNetworkMap();
  }

  private async soraCardTokenSubscribe(id: string, port: Port): Promise<boolean> {
    return this.state.soraCardService.soraCardTokenSubscribe(id, port);
  }

  authorizeApprovePolkaswap(authorizedAccounts: string[]): Promise<void> {
    return this.state.approvePolkaswap(authorizedAccounts);
  }

  isOnboardingRequired() {
    return this.state.onboardingService.isRequired;
  }

  setOnboardingSeen() {
    this.state.onboardingService.setSeen();
  }

  getOnboardingStories(lang: string): OnboardingStories {
    return this.state.onboardingService.getStories(lang);
  }

  async connectWalletConnect({ uri }: RequestConnectWalletConnect): Promise<Record<string, string> | boolean> {
    return this.state.walletConnectService
      .connect(uri)
      .then(() => {
        return true;
      })
      .catch((error) => {
        if ((error.message as string).includes(getInternalError('MISSING_OR_INVALID').message))
          return { message: 'walletConnect.pairingErrorMessage' };
        if (error.message === getInternalError('UNKNOWN_TYPE').message)
          return {
            message: 'walletConnect.relayNotSupported',
          };

        return { message: 'Unknown error' };
      });
  }

  private connectWCSubscribe(id: string, port: chrome.runtime.Port): WalletConnectSessionRequest[] {
    const cb = createSubscription<'pri(walletConnect.requests.connect.subscribe)'>(id, port);
    const subscription = this.state.requestService.connectWCSubject.subscribe(
      (requests: WalletConnectSessionRequest[]): void => cb(requests)
    );

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
      subscription.unsubscribe();
    });

    return this.state.requestService.allConnectWCRequests;
  }

  private async approveWalletConnectSession({
    accounts: selectedAccounts,
    id,
  }: RequestApproveConnectWalletSession): Promise<NotificationResponse> {
    const request = this.state.requestService.getConnectWCRequest(id);

    if (isProposalExpired(request.request.params)) {
      request.reject(new Error('The proposal has been expired'));

      return {
        message: 'walletConnect.notifications.sessionExpired.message',
        title: 'walletConnect.notifications.sessionExpired.title',
      };
    }

    const { id: wcId, params } = request.request;
    const { requiredNamespaces, optionalNamespaces } = params;

    const availableNamespaces: ProposalTypes.RequiredNamespaces = {};

    const namespaces: SessionTypes.Namespaces = {};
    const chainInfoMap = this.state.networkMap;
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
            };
          }

          availableNamespaces[key] = namespace;
        }
      } else {
        request.reject(new Error('Unsupported chain'));

        return {
          message: 'walletConnect.notifications.unsupportedProposal.message',
          title: 'walletConnect.notifications.unsupportedProposal.title',
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
      const substrateAddress = getSubstrateAddress(selectedAccounts[0], this.state);

      chains.forEach((chain) => {
        if (key === WALLET_CONNECT_EIP155_NAMESPACE) {
          accounts.push(`${chain}:${selectedAccounts[0]}`);
        } else if (key === WALLET_CONNECT_POLKADOT_NAMESPACE) {
          accounts.push(`${chain}:${substrateAddress}`);
        }
      });

      namespaces[key] = {
        accounts,
        methods: namespace.methods,
        events: namespace.events,
        chains: chains,
      };
    }

    const result: ResultApproveWalletConnectSession = {
      id: wcId,
      namespaces,
      relayProtocol: params.relays[0].protocol,
    };

    await this.state.walletConnectService.approveSession(result);
    request.resolve();

    return {
      message: '',
      title: 'walletConnect.notifications.sessionApproved.title',
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

  private subscribeWalletConnectSessions(id: string, port: chrome.runtime.Port): SessionTypes.Struct[] {
    const cb = createSubscription<'pri(walletConnect.session.subscribe)'>(id, port);

    const subscription = this.state.walletConnectService.sessionSubject.subscribe((rs) => {
      cb(rs);
    });

    port.onDisconnect.addListener((): void => {
      subscription.unsubscribe();
      this.cancelSubscription(id);
    });

    return this.state.walletConnectService.sessions;
  }

  private async disconnectWalletConnectSession({ topic }: RequestDisconnectWalletConnectSession): Promise<boolean> {
    await this.state.walletConnectService.disconnect(topic);

    return true;
  }

  wcSigningSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(walletConnect.signing.requests.subscribe)'>(id, port);

    const subscription = this.state.requestService.signWcSubject.subscribe(
      (requests: WalletConnectTransactionRequest[]): void => cb(requests)
    );

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  async wcRequestApprove({ address, password, topic, isSavePass }: RequestApproveWalletConnect) {
    const substrateAddress = getSubstrateAddress(address, this.state);

    if (password === '') {
      const eth = this.state.keyringService.getPair(address);

      if (eth?.isLocked) {
        throw new Error(BasicTxErrorCode.KEYRING_ERROR);
      }
    } else {
      const errors = this.validatePairPassword(address, password);

      if (errors.length) throw new Error(BasicTxErrorCode.KEYRING_ERROR);
    }

    const request = this.state.requestService.signWcRequest(topic);

    const method = request.request.params.request.method;
    const [, chainId] = request.request.params.chainId.split(':');
    const network = Object.values(this.state.networkMap).find((el) => el.chainId === chainId);

    if (!network) throw new Error(TransferErrorCode.UNSUPPORTED);

    const privateKey = this.state.accountExportPrivateKey({ address, password });
    const signer = new Wallet(privateKey.privateKey, this.state.getEvmApiMap[network.name]);

    if (method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
      const txData = request.request.params.request.params[0] as { to: string; value: string };

      const { hash } = await signer.sendTransaction(txData);
      request.resolve({ id: request.request.topic, signature: hash as HexString });
    } else {
      const params = request.request.params.request.params;

      if (
        [
          'eth_sign',
          'personal_sign',
          'eth_signTypedData',
          'eth_signTypedData_v1',
          'eth_signTypedData_v3',
          'eth_signTypedData_v4',
        ].indexOf(method) < 0
      ) {
        throw new Error('Not found sign method');
      }

      const signature = await signer.signMessage(convertHexToUtf8(params[0]));

      request.resolve({ id: request.request.topic, signature: signature as HexString });
    }

    if (password !== '') {
      const subst = this.state.keyringService.getPair(substrateAddress);
      subst?.unlock(password);

      const eth = this.state.keyringService.getPair(address);
      eth?.unlock(password);
    }

    this.savePass(substrateAddress, address, isSavePass, false);

    return true;
  }

  wcRequestReject({ topic }: RequestDisconnectWalletConnectSession) {
    const request = this.state.requestService.signWcRequest(topic);

    request?.reject(new Error('USER_REJECTED'));

    return true;
  }

  private WCNotSupportSubscribe(id: string, port: chrome.runtime.Port): WalletConnectNotSupportRequest[] {
    const cb = createSubscription<'pri(walletConnect.requests.notSupport.subscribe)'>(id, port);
    const subscription = this.state.requestService.notSupportWCSubject.subscribe(
      (requests: WalletConnectNotSupportRequest[]): void => cb(requests)
    );

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
      subscription.unsubscribe();
    });

    return this.state.requestService.allNotSupportWCRequests;
  }

  private approveWalletConnectNotSupport({ id }: RequestApproveWalletConnectNotSupport): boolean {
    const request = this.state.requestService.getNotSupportWCRequest(id);

    request.resolve();

    return true;
  }

  private rejectWalletConnectNotSupport({ id }: RequestRejectWalletConnectNotSupport): boolean {
    const request = this.state.requestService.getNotSupportWCRequest(id);

    request.reject(new Error('USER_REJECTED'));

    return true;
  }

  async handle<TMessageType extends MessageTypes>(
    id: string,
    type: TMessageType,
    request: RequestTypes[TMessageType],
    port: Port
  ): Promise<ResponseType<TMessageType>> {
    switch (type) {
      //App Managment, networks
      case 'pri(app.port.ping)':
        return true;

      case 'pri(soraCard.token)':
        return this.soraCardTokenSubscribe(id, port);

      case 'pri(networkMap.upsert)':
        return this.upsertNetworkMap(request as NetworkJson);

      case 'pri(networkMap.toggle.favorite)':
        return this.toggleNetworkFavorite(request as string);

      case 'pri(networkMap.getSubscription)':
        return this.subscribeNetworkMap(id, port);

      case 'pri(authorize.approve)':
        return this.authorizeApprove(request as RequestAuthorizeApprove);

      case 'pri(authorize.list)':
        return this.getAuthList();

      case 'pri(authorize.approve.polkaswap)':
        return this.authorizeApprovePolkaswap(request as string[]);

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

      case 'pri(addresses.subscribe)':
        return this.addressesSubscribe(id, port);

      case 'pri(accounts.create.mobile)':
        return this.createMobileWallet(request as RequestAddressCreate);

      case 'pri(accounts.validate.path)':
        return this.validateDerivationPath(request as DerivationPath);

      case 'pri(accounts.create)':
        return this.accountsCreate(request as RequestAccountCreateSuri);

      case 'pri(price.update.currency)':
        return this.updateCurrencySymbol(request as string);

      case 'pri(price.subscription)':
        return this.subscribePrice(id, port);

      case 'pri(accounts.update.current)':
        return this.updateCurrentAccount(request as string, false);

      case 'pri(accounts.update.currentNetwork)':
        return this.setActiveNetworks(request as string);

      case 'pri(accounts.update.meta)':
        return this.updatePairMeta(request as RequestUpdateMeta);

      case 'pri(accounts.export)':
        return this.accountsExport(request as RequestAccountExport);

      case 'pri(accounts.forget)':
        return this.accountsForget(request as RequestAccountForget);

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
        return this.getTotalBalances();

      /// Transfer, CrossChain, Sora Swap
      case 'pri(accounts.checkTransfer)':
        return this.checkTransfer(request as RequestCheckTransfer);

      case 'pri(accounts.transfer)':
        return this.makeTransfer(id, port, request as RequestTransfer);

      case 'pri(accounts.checkCrossChain)':
        return this.checkCrossChain(request as RequestCheckCrossChain);

      case 'pri(accounts.crossChain)':
        return this.makeCrossChain(id, port, request as RequestCrossChain);

      case 'pri(accounts.checkSwap)':
        return this.validateSwap(request as RequestCheckSwap);

      case 'pri(accounts.swap)':
        return this.makeSwap(request as RequestSwap);

      case 'pri(accounts.soraFees)':
        return this.getSoraFees();

      case 'pri(metadata.approve)':
        return this.metadataApprove(request as RequestMetadataApprove);

      case 'pri(metadata.reject)':
        return this.metadataReject(request as RequestMetadataReject);

      case 'pri(metadata.requests)':
        return port && this.metadataSubscribe(id, port);

      case 'pri(activeTabsUrl.update)':
        return this.updateCurrentTabs(request as RequestActiveTabsUrlUpdate);

      case 'pri(signing.approve.password)':
        return this.signingApprovePassword(request as RequestSigningApprovePassword);

      case 'pri(signing.approve.signature)':
        return this.signingApproveSignature(request as RequestSigningApproveSignature);

      case 'pri(signing.cancel)':
        return this.signingCancel(request as RequestSigningCancel);

      case 'pri(signing.isLocked)':
        return this.signingIsLocked(request as RequestSigningIsLocked);

      case 'pri(signing.requests)':
        return this.signingSubscribe(id, port);

      case 'pri(mobileSigning.cancel)':
        return this.mobileSigningCancel(request as RequestSigningCancel);

      case 'pri(mobileSigning.tx)':
        return this.mobileSigningSubscribe(id, port);

      case 'pri(mobileSigning.approve.signature)':
        return this.mobileSignApprove(request as RequestMobileSign);

      case 'pri(window.open)':
        return this.windowOpen(request as AllowedPath);

      case 'pri(google.get.files)':
        return this.getFiles(request as { token: string });

      case 'pri(google.auth)':
        return this.initAuth(request as GoogleAuthTypes);

      case 'pri(google.verify.token)':
        return this.verifyToken(request as { token: string });

      case 'pri(google.get.file)':
        return this.getFile(request as GoogleFileId);

      case 'pri(google.create.file)':
        return this.createFile(request as ICreateFile);

      case 'pri(google.delete.file)':
        return this.deleteFile(request as GoogleFileId);

      case 'pri(tab.status)':
        return this.isTabAuthorize();

      case 'pri(balance)':
        return this.getBalance();

      case 'pri(fetch.evm.balance)':
        return this.fetchEvmBalance();

      case 'pri(balance.subscription)':
        return this.subscribeBalance(id, port);

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
        return this.wcRequestReject(request as RequestDisconnectWalletConnectSession);

      case 'pri(walletConnect.signing.requests.subscribe)':
        return this.wcSigningSubscribe(id, port);

      // Not support
      case 'pri(walletConnect.requests.notSupport.subscribe)':
        return this.WCNotSupportSubscribe(id, port);

      case 'pri(walletConnect.notSupport.approve)':
        return this.approveWalletConnectNotSupport(request as RequestApproveWalletConnectNotSupport);

      case 'pri(walletConnect.notSupport.reject)':
        return this.rejectWalletConnectNotSupport(request as RequestRejectWalletConnectNotSupport);

      //OnBoarding
      case 'pri(onboarding.get.stories)':
        return this.getOnboardingStories(request as string);

      case 'pri(onboarding.seen)':
        return this.setOnboardingSeen();

      case 'pri(onboarding.isRequired)':
        return this.isOnboardingRequired();

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
