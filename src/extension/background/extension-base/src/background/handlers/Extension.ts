import { api as apiSora, FPNumber } from '@sora-substrate/util';
import { ALLOWED_PATH, PASSWORD_EXPIRY_MS } from '@extension-base/defaults';
import { hexToU8a, isHex, assert } from '@polkadot/util';
import {
  keyExtractSuri,
  mnemonicGenerate,
  mnemonicValidate,
  isEthereumAddress,
  base64Decode,
} from '@polkadot/util-crypto';
import { createPair } from '@polkadot/keyring';
import { keyring } from '@polkadot/ui-keyring';
import {
  getERC20TransactionObject,
  getEVMTransactionObject,
  makeERC20Transfer,
  makeEVMTransfer,
} from '@extension-base/api/evm/transfer';
import { checkMainToken } from '@extension-base/api/helpers';
import { estimateFee, makeTransfer } from '@extension-base/api/substrate/transfer';
import { getAssetInfo } from '@extension-base/api/substrate/registry';
import { createSwap } from '@extension-base/api/substrate/swaps';
import { withErrorLog } from '@extension-base/background/handlers/helpers';
import State, { registry } from '@extension-base/background/handlers/State';
import { createSubscription, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import FWExtensionBase from '@extension-base/background/handlers/ExtensionBase';
import { state } from '@extension-base/background/handlers';
import {
  createCrossChainExtrinsic,
  makeCrossChain,
  estimateCrossChainFee,
} from '@extension-base/api/substrate/crossChain';
import { BasicTxErrorCode, RequestUpdateMeta, TransferErrorCode } from '@extension-base/background/types/types';
import { ethers } from 'ethers';
import {
  balanceItemByNetwork,
  getSubstrateAddress,
  isRequireSubstrateAPI,
} from '@extension-base/background/utils/utils';

import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { addresses as addressesObservable } from '@polkadot/ui-keyring/observable/addresses';
import type {
  MobileSigningRequest,
  RequestMobileSign,
  ActiveTabAuthorizeStatus,
  BalanceJson,
  BasicTxError,
  BasicTxResponse,
  BasicTxWarning,
  Port,
  PriceJson,
  RequestCheckSwap,
  RequestCheckTransfer,
  RequestCheckCrossChain,
  RequestSwap,
  RequestTransfer,
  RequestCrossChain,
  ResponseCheckSwap,
  ResponseCheckTransfer,
  ResponseCheckCrossChain,
  ResponseMakeSwap,
  AccountJson,
  AllowedPath,
  AuthorizedAccountsDiff,
  AuthorizeRequest,
  GoogleFileId,
  MessageTypes,
  MetadataRequest,
  RequestAccountBatchExport,
  RequestAccountCreateExternal,
  RequestAccountCreateSuri,
  RequestAccountExport,
  RequestAccountForget,
  RequestAccountShow,
  RequestAccountTie,
  RequestAccountName,
  RequestAccountValidate,
  RequestActiveTabsUrlUpdate,
  RequestAddressCreate,
  RequestAuthorizeApprove,
  RequestBatchRestore,
  RequestDeriveCreate,
  RequestDeriveValidate,
  RequestJsonRestore,
  RequestMetadataApprove,
  RequestMetadataReject,
  RequestSeedCreate,
  RequestSeedValidate,
  RequestSigningApprovePassword,
  RequestSigningApproveSignature,
  RequestSigningCancel,
  RequestSigningIsLocked,
  RequestTypes,
  RequestUpdateAuthorizedAccounts,
  ResponseAuthorizeList,
  ResponseDeriveValidate,
  ResponseSeedCreate,
  ResponseSeedValidate,
  ResponseType,
  SigningRequest,
} from '@extension-base/background/types/types';
import type { CurrentAccountInfo, CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import type {
  Asset,
  RequestTransactionHistoryAdd,
  NetworkJson,
  TransactionHistoryItemType,
} from '@extension-base/types';
import type { KeyringPair$Json, KeyringPair, KeyringPair$Meta } from '@polkadot/keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { MetadataDef } from '@polkadot/extension-inject/types';
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
const SEED_DEFAULT_LENGTH = 12;
const SEED_LENGTHS = [12, 15, 18, 21, 24];
const ETH_DERIVE_DEFAULT = "/m/44'/60'/0'/0/0";

function getSuri(seed: string, type?: KeypairType): string {
  return type === 'ethereum' ? `${seed}${ETH_DERIVE_DEFAULT}` : seed;
}

function isJsonPayload(value: SignerPayloadJSON | SignerPayloadRaw): value is SignerPayloadJSON {
  return (value as SignerPayloadJSON).genesisHash !== undefined;
}

async function transformAccounts(accounts: SubjectInfo): Promise<AccountJson[]> {
  const currentAccount = await state.currentAccount;

  const transformedAccounts = Object.values(accounts)
    .filter((el) => !isEthereumAddress(el.json.address))
    .map(({ json: { address, meta }, type }): AccountJson => {
      const isDefault = address === currentAccount?.address;
      const currentNetwork = state.selectedNetwork[address] ?? ALL_NETWORKS;

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
    const selectedNetwork = this.state.selectedNetwork[address] ?? ALL_NETWORKS;
    this.state.setActiveNetworks(selectedNetwork);
  }

  accountsCreateSuri({ password, suri, type, meta }: RequestAccountCreateSuri): string {
    const {
      pair: { address },
    } = keyring.addUri(suri, password, { ...meta, isMobile: false }, type);

    if (!isEthereumAddress(address)) {
      this.updateNetworkForNewWallet(address);
      this.updateCurrentAccountAddress(address);
    }

    return address;
  }

  async accountsForget({ address, type }: RequestAccountForget): Promise<boolean> {
    const authorizedAccountsDiff: AuthorizedAccountsDiff = [];

    // cycle through authUrls and prepare the array of diff
    Object.entries(this.state.authUrls).forEach(([url, urlInfo]) => {
      if (!urlInfo.authorizedAccounts.includes(address)) {
        return;
      }

      authorizedAccountsDiff.push([
        url,
        urlInfo.authorizedAccounts.filter((previousAddress) => previousAddress !== address),
      ]);
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
      const pair = keyring.getAccount(address);
      const ethereumAddress = pair?.meta.ethereumAddress as string | undefined;

      if (ethereumAddress) keyring.forgetAccount(ethereumAddress);

      keyring.forgetAccount(address);
    } else keyring.forgetAddress(address);

    const accounts = keyring.getAccounts();
    const addresses = keyring.getAddresses();

    const currentAcc = await this.state.currentAccount;

    const shouldUpdate =
      !accounts.some(({ address }) => address === currentAcc?.address) ||
      !addresses.some(({ address }) => address === currentAcc?.address);

    const isNoAccounts = !accounts.length && !addresses.length;

    if (shouldUpdate || isNoAccounts) {
      let account;

      if (accounts.length) account = accounts.find(({ address }) => !isEthereumAddress(address))!;
      else if (addresses.length) {
        account = addresses[0];
      }

      this.updateCurrentAccountAddress(account ? account.address : '');
    }

    return true;
  }

  accountsValidatePassword({ address, password }: RequestAccountValidate): boolean {
    try {
      keyring.backupAccount(keyring.getPair(address), password);

      return true;
    } catch (e) {
      return false;
    }
  }

  async addressesSubscribe(id: string, port: Port): Promise<AccountJson[]> {
    const cb = createSubscription<'pri(addresses.subscribe)'>(id, port);

    const transformedAddresses = transformAccounts(addressesObservable.subject.value);

    const subscription = addressesObservable.subject.subscribe((addresses: SubjectInfo): void => {
      transformAccounts(addresses).then(cb);
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return transformedAddresses;
  }

  async accountsSubscribe(id: string, port: Port): Promise<AccountJson[]> {
    const cb = createSubscription<'pri(accounts.subscribe)'>(id, port);

    const transformedAccounts = transformAccounts(accountsObservable.subject.value);

    const subscription = accountsObservable.subject.subscribe((accounts: SubjectInfo): void => {
      transformAccounts(accounts).then(cb);
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return transformedAccounts;
  }

  authorizeApprove({ authorizedAccounts, id }: RequestAuthorizeApprove): boolean {
    const queued = this.state.getAuthRequest(id);

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
    return { list: this.state.authUrls };
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
        const authorizeUrl = Object.keys(this.state.authUrls).filter((url) => url === tabHostName);
        const isAuthorize = authorizeUrl.length !== 0;

        resolve({
          isAuthorize,
          authorizeAccountsCount: isAuthorize ? this.state.authUrls[tabHostName].authorizedAccounts.length : 0,
          dAppName: tabHostName,
        });
      });
    });
  }

  authorizeSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(authorize.requests)'>(id, port);

    const subscription = this.state.authSubject.subscribe((requests: AuthorizeRequest[]): void => cb(requests));

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  async metadataApprove({ id }: RequestMetadataApprove): Promise<boolean> {
    const queued = this.state.getMetaRequest(id);

    assert(queued, 'Unable to find request');

    const { request, resolve } = queued;

    this.state.saveMetadata(request);

    resolve(true);

    return true;
  }
  metadataReject({ id }: RequestMetadataReject): boolean {
    const queued = this.state.getMetaRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    reject(new Error('Rejected'));

    return true;
  }

  metadataSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(metadata.requests)'>(id, port);

    const subscription = this.state.metaSubject.subscribe((requests: MetadataRequest[]): void => cb(requests));

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
      pair.decodePkcs8(password);
      pair.lock();

      return true;
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  jsonRestore({ file, password }: RequestJsonRestore): Promise<string> {
    const isPasswordValidated = this.validatePassword(file, password);
    const { address } = this.jsonGetAccountInfo(file);

    if (isPasswordValidated) {
      return new Promise((resolve, reject) => {
        try {
          keyring.restoreAccount(file, password);
          if (!isEthereumAddress(address)) this.updateNetworkForNewWallet(address);
          this.updateCurrentAccountAddress(address);
          resolve(address);
        } catch (error) {
          reject({ error: (error as Error).message });
        }
      });
    } else {
      throw new Error('Unable to decode using the supplied passphrase');
    }
  }

  private async enableNetworkType(type: string): Promise<void> {
    this.state.enableNetworkType(type);
  }

  private async toggleNetworkFavorite(networkKey: string): Promise<void> {
    await this.state.setFavoriteNetwork(networkKey);
  }

  private async upsertNetworkMap(data: NetworkJson): Promise<boolean> {
    try {
      return await this.state.upsertNetworkMap(data);
    } catch (e) {
      console.error(e);

      return false;
    }
  }

  seedCreate({ length = SEED_DEFAULT_LENGTH, seed: _seed, type }: RequestSeedCreate): ResponseSeedCreate {
    const seed = _seed || mnemonicGenerate(length);

    return {
      address: keyring.createFromUri(getSuri(seed, type), {}, type).address,
      seed,
    };
  }

  private _saveCurrentAccountAddress(address: string, callback?: (account: CurrentAccountState) => void) {
    if (address === '') {
      this.state.setCurrentAccount(null);

      return;
    }

    const {
      meta: { isMobile, name, ethereumAddress },
    } = keyring.getAccount(address) ?? keyring.getAddress(address)!;

    const accountInfo: CurrentAccountInfo = {
      address,
      isMobile: !!(isMobile as boolean),
      name: name as string,
      ethereumAddress: (ethereumAddress as string) ?? '',
    };

    this.state.setCurrentAccount(accountInfo, () => {
      callback && callback(accountInfo);
    });
  }

  private triggerWalletsSubscription(): boolean {
    const accountsSubject = accountsObservable.subject;
    const addressSubject = addressesObservable.subject;

    accountsSubject.next(accountsSubject.getValue());
    addressSubject.next(addressSubject.getValue());

    return true;
  }

  private updateCurrentAccountAddress(address: string): boolean {
    if (isEthereumAddress(address)) return false;

    this.state.generateDefaultBalance(address);

    this._saveCurrentAccountAddress(address, () => {
      this.triggerWalletsSubscription();
    });

    return true;
  }

  seedValidate({ suri, type }: RequestSeedValidate): ResponseSeedValidate {
    const { phrase } = keyExtractSuri(suri);

    if (isHex(phrase)) {
      assert(isHex(phrase, 256), 'Hex seed needs to be 256-bits');
    } else {
      // sadly isHex detects as string, so we need a cast here
      assert(
        SEED_LENGTHS.includes(phrase.split(' ').length),
        `Mnemonic needs to contain ${SEED_LENGTHS.join(', ')} words`
      );
      assert(mnemonicValidate(phrase), 'Not a valid mnemonic seed');
    }

    return {
      address: keyring.createFromUri(getSuri(suri, type), {}, type).address,
      suri,
    };
  }

  signingApprovePassword({ id, password, savePass }: RequestSigningApprovePassword): boolean {
    const queued = this.state.getSignRequest(id);

    assert(queued, 'Unable to find request');

    const { reject, request, resolve } = queued;
    const pair = keyring.getPair(queued.account.address);

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

    const queued = this.state.getSignRequest(id);

    assert(queued, 'Unable to find request');

    queued.resolve({ id, signature });

    return true;
  }

  signingCancel({ id }: RequestSigningCancel): boolean {
    const queued = this.state.getSignRequest(id);

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

    const subscription = this.state.signSubject.subscribe((requests: SigningRequest[]): void => cb(requests));

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

  derive(parentAddress: string, suri: string, password: string, metadata: KeyringPair$Meta): KeyringPair {
    const parentPair = keyring.getPair(parentAddress);

    try {
      parentPair.decodePkcs8(password);
    } catch (e) {
      throw new Error('invalid password');
    }

    try {
      return parentPair.derive(suri, metadata);
    } catch (err) {
      throw new Error(`"${suri}" is not a valid derivation path`);
    }
  }

  derivationValidate({ parentAddress, parentPassword, suri }: RequestDeriveValidate): ResponseDeriveValidate {
    const childPair = this.derive(parentAddress, suri, parentPassword, {});

    return {
      address: childPair.address,
      suri,
    };
  }

  derivationCreate({ genesisHash, name, parentAddress, parentPassword, password, suri }: RequestDeriveCreate): boolean {
    const childPair = this.derive(parentAddress, suri, parentPassword, {
      genesisHash,
      name,
      parentAddress,
      suri,
    });

    keyring.addPair(childPair, password);

    return true;
  }

  async removeAuthorization(url: string): Promise<ResponseAuthorizeList> {
    const list = await this.state.removeAuthorization(url);

    return { list };
  }

  async deleteAuthRequest(requestId: string): Promise<void> {
    return this.state.deleteAuthRequest(requestId);
  }

  updateCurrentTabs({ tabs }: RequestActiveTabsUrlUpdate) {
    this.state.updateCurrentTabsUrl(tabs);
  }

  createAddress({ address, meta }: RequestAddressCreate) {
    keyring.saveAddress(address, meta, 'address');
  }

  removeAddress(address: string) {
    keyring.forgetAddress(address);
  }

  getAddresses() {
    return keyring.getAddresses();
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

  private getBalance(reset?: boolean): Promise<BalanceJson> {
    return this.state.getBalance(reset);
  }

  private subscribeBalance(id: string, port: Port): Promise<BalanceJson> {
    const cb = createSubscription<'pri(balance.get.subscription)'>(id, port);

    const balanceSubscription = this.state.balanceSubject.subscribe({
      next: (rs) => {
        cb(rs);
      },
    });

    this.createUnsubscriptionHandle(id, balanceSubscription.unsubscribe);

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
    });

    return this.getBalance(true);
  }

  private subscribeHistory(id: string, port: Port): Record<string, TransactionHistoryItemType[]> {
    const cb = createSubscription<'pri(transaction.history.get.subscription)'>(id, port);

    const historySubscription = this.state.subscribeHistory().subscribe({
      next: (rs) => {
        cb(rs);
      },
    });

    this.createUnsubscriptionHandle(id, historySubscription.unsubscribe);

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
    });

    return this.state.getHistoryMap();
  }

  private updateTransactionHistory(
    { address, item, networkKey }: RequestTransactionHistoryAdd,
    id: string,
    port: Port
  ): boolean {
    const cb = createSubscription<'pri(transaction.history.add)'>(id, port);

    this.state.setHistory(address, networkKey, item, (items) => {
      cb(items);
    });

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
    });

    return true;
  }

  private updateCurrencySymbol(symbol: string) {
    this.state.setFiatSymbol(symbol);
    this.state.refreshPrice();
  }

  private getPrice(): Promise<PriceJson> {
    return new Promise<PriceJson>((resolve) => {
      this.state.getPrice((rs: PriceJson) => {
        resolve(rs);
      });
    });
  }

  private subscribePrice(id: string, port: chrome.runtime.Port): Promise<PriceJson> {
    const cb = createSubscription<'pri(price.get.subscription)'>(id, port);

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
    const { AToB, BToA, amountA, amountB, minMaxValue, extrinsicOptions, providerFee, route } = await createSwap(
      options,
      apiSora
    );

    return {
      swapOptions: extrinsicOptions.swapOptions,
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
    const { extrinsicOptions } = await createSwap(options, apiSora);
    const { password, isSavePass } = options;
    const { isExchangeB, swapDexId, amountA, amountB, slippage, assetA, assetB, marketType } = extrinsicOptions;
    let status = false;
    const errors: Array<BasicTxError> = [];
    const address = await this.state.getAccountAddress();
    const liquiditySource = LIQUID_SOURCE_FOR_MARKET[marketType!];

    if (!address) {
      errors.push({
        code: BasicTxErrorCode.KEYRING_ERROR,
        message: 'Something went wrong',
      });

      return {
        errors,
        status,
      };
    }

    const pair = keyring.getPair(address);

    const remainTime = this.refreshAccountPasswordCache(pair);

    // if the keyring pair is locked, the password is needed
    if (pair.isLocked && !password) {
      errors.push({
        code: BasicTxErrorCode.KEYRING_ERROR,
        message: 'Password needed to unlock the account',
      });

      return {
        errors,
        status,
      };
    }

    try {
      if (pair.isLocked && password) pair.unlock(password);
    } catch (e: any) {
      pair.lock();

      errors.push({
        code: BasicTxErrorCode.KEYRING_ERROR,
        message: String(e.message),
      });
    }

    if (errors.length)
      return {
        status,
        errors,
      };

    apiSora.shouldPairBeLocked = !isSavePass;

    try {
      await apiSora.swap.execute(assetA, assetB, amountA, amountB, slippage, isExchangeB, liquiditySource, swapDexId);

      status = true;
    } catch (ex) {
      errors.push({
        code: TransferErrorCode.TRANSFER_ERROR,
        message: '',
      });

      console.info(`Swap transaction failed ${ex}`);
    }

    const ethereumAddress = keyring.getAccount(address)?.meta.ethereumAddress as string | undefined;

    if (isSavePass) {
      this.cachedUnlocks[address] = Date.now() + PASSWORD_EXPIRY_MS;

      if (ethereumAddress) this.cachedUnlocks[ethereumAddress] = Date.now() + PASSWORD_EXPIRY_MS;
    } else if (remainTime) {
      this.cachedUnlocks[address] = 0;

      pair.lock();

      if (ethereumAddress) {
        this.cachedUnlocks[ethereumAddress] = 0;

        keyring.getPair(ethereumAddress).lock();
      }
    }

    return {
      status,
      errors,
    };
  }

  private validateTransfer(
    tokenId: string,
    from: string,
    password: string | undefined
  ): [Array<BasicTxError>, KeyringPair | undefined, Asset] {
    const errors = [] as Array<BasicTxError>;
    const substrateAddress = getSubstrateAddress(from);
    const substratePair = keyring.getAccount(substrateAddress) ? keyring.getPair(substrateAddress) : undefined;

    if (password) {
      try {
        if (substratePair) {
          substratePair.unlock(password);

          const { meta } = substratePair;
          const ethereumAddress = meta.ethereumAddress as string | undefined;

          if (ethereumAddress) {
            const pair = keyring.getPair(ethereumAddress);

            pair.unlock(password);
          }
        }
      } catch (e: any) {
        errors.push({
          code: BasicTxErrorCode.KEYRING_ERROR,
          message: String(e.message),
        });
      }
    }

    const tokenInfo = getAssetInfo(tokenId);
    const resultPair = isEthereumAddress(from) ? keyring.getPair(from) : substratePair;

    return [errors, resultPair, tokenInfo];
  }

  private async checkTransfer({
    from,
    networkKey: givenNetwork,
    to,
    assetId,
    relayChain,
    amount,
    password,
  }: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
    const networkKey = this.state.getNetworkByKey(givenNetwork)?.name ?? '';

    const [errors, , tokenInfo] = this.validateTransfer(assetId, from, password);
    const warnings: BasicTxWarning[] = [];

    if (networkKey === '')
      return {
        errors,
        warnings,
        destEstimateFee: undefined,
        fromAccountFree: '0',
        estimateFee: '0',
      };

    const isMainToken = checkMainToken(networkKey, tokenInfo.id);

    const address = getSubstrateAddress(from);
    let fee = 0;
    let fromAccountFreeBalance = '0';

    const tokenBalance = this.state.balanceMap[address].find(
      (balance) => balance.assetId === assetId && balance.relayChain.toLowerCase() === relayChain?.toLowerCase()
    )!;

    if (isEthereumAddress(from) && isEthereumAddress(to) && !isRequireSubstrateAPI(networkKey)) {
      const fromAccountFreeBalance = tokenBalance
        ? balanceItemByNetwork(tokenBalance.balances, networkKey)?.transferable ?? '0'
        : '0';
      const txVal = fromAccountFreeBalance || '0';

      // Estimate with EVM API
      if (!isMainToken && tokenInfo.id) {
        const prepContractAddress = `0x${tokenInfo.id}`;
        const { fee: feeValue } = await getERC20TransactionObject(prepContractAddress, networkKey, from, to, txVal);

        fee = +ethers.formatEther(feeValue);
      } else {
        const { fee: feeValue } = await getEVMTransactionObject(networkKey, to, txVal);

        fee = +ethers.formatEther(feeValue);
      }
    } else {
      // Estimate with DotSama API

      const feeNumber = await estimateFee(networkKey, to, amount, tokenBalance);
      fee = feeNumber;
      fromAccountFreeBalance = balanceItemByNetwork(tokenBalance.balances, networkKey)?.transferable ?? '0';
    }

    return {
      errors,
      warnings,
      fromAccountFree: fromAccountFreeBalance,
      estimateFee: fee.toString(),
    } as unknown as ResponseCheckTransfer;
  }

  private async makeTransfer(
    id: string,
    port: Port,
    { from, networkKey: givenNetwork, password, to, assetId, amount, isSavePass, isMobile }: RequestTransfer
  ): Promise<BasicTxResponse | undefined> {
    const networkKey = this.state.getNetworkByKey(givenNetwork)?.name ?? '';

    const txState: BasicTxResponse = {};

    const [errors, fromKeyPair, tokenInfo] = this.validateTransfer(assetId, from, password);

    if (errors.length) {
      txState.txError = true;
      txState.errors = errors;

      setTimeout(() => this.cancelSubscription(id), 500);

      // todo: add condition to lock KeyPair (for example: not remember password)

      return txState;
    }

    if (!fromKeyPair && !isMobile) {
      txState.status = false;
      txState.txError = true;

      return txState;
    }

    const cb = createSubscription<'pri(accounts.transfer)'>(id, port);

    const ethereumAddress = fromKeyPair ? (fromKeyPair.meta.ethereumAddress as string | undefined) : '';
    const isEthereum = isEthereumAddress(from);
    const address = getSubstrateAddress(from);
    const remainTime = fromKeyPair ? this.getRemainingTime(fromKeyPair) : 0;

    const savePass = () => {
      this.savePass(address, isEthereum ? from : ethereumAddress, remainTime, !!isSavePass, !!isMobile);
    };

    const callback = this.makeExtrinsicCallback(cb, savePass);

    let transferProm: Promise<void> | undefined;

    if (isEthereumAddress(from) && isEthereumAddress(to) && !isRequireSubstrateAPI(networkKey)) {
      // Make transfer with EVM API
      const { privateKey } = this.accountExportPrivateKey({ address: from, password });
      const isMainToken = tokenInfo ? checkMainToken(networkKey, tokenInfo.id) : false;

      if (tokenInfo && !isMainToken && tokenInfo.id) {
        transferProm = makeERC20Transfer(tokenInfo.id, networkKey, from, to, privateKey, amount || '0', callback);
      } else {
        transferProm = makeEVMTransfer(networkKey, to, privateKey, amount || '0', callback);
      }
    } else {
      // Make transfer with Dotsama API
      transferProm = makeTransfer({
        networkKey,
        assetId,
        amount: amount ?? '0',
        from,
        to,
        password,
        isSavePass,
        callback,
        isMobile: !!isMobile,
      });
    }

    await transferProm
      .then(() => {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        console.info(`Start transfer ${amount} from ${from} to ${to}`);
      })
      .catch((e) => {
        console.error('Transfer error', e);

        cb({
          txError: true,
          status: false,
          errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: (e as Error).message }],
        });

        setTimeout(() => this.cancelSubscription(id), 500);

        // todo: add condition to lock KeyPair
      });

    port.onDisconnect.addListener(() => this.cancelSubscription(id));

    return txState;
  }

  savePass(
    address: string,
    ethereumAddress: string | undefined,
    remainTime: number,
    isSavePass: boolean,
    isMobile: boolean
  ) {
    if (isMobile) return;

    if (isSavePass) {
      this.cachedUnlocks[address] = Date.now() + PASSWORD_EXPIRY_MS;

      if (ethereumAddress) this.cachedUnlocks[ethereumAddress] = Date.now() + PASSWORD_EXPIRY_MS;
    } else if (remainTime) {
      this.cachedUnlocks[address] = 0;
      const pair = keyring.getPair(address);

      pair.lock();

      if (ethereumAddress) {
        this.cachedUnlocks[ethereumAddress] = 0;
        const ethereumPair = keyring.getPair(ethereumAddress);

        ethereumPair.lock();
      }
    }
  }

  private async checkCrossChain({
    from,
    originNet: originNetKey,
    destinationNet,
    to,
    assetId,
    relayChain,
    amount,
  }: RequestCheckCrossChain): Promise<ResponseCheckCrossChain> {
    const originNet = this.state.getNetworkByKey(originNetKey)?.name ?? '';
    const address = getSubstrateAddress(from);
    const tokenBalance = this.state.balanceMap[address].find(
      (balance) => balance.assetId === assetId && balance.relayChain.toLowerCase() === relayChain?.toLowerCase()
    )!;

    const extrinsic = await createCrossChainExtrinsic(assetId, originNet, destinationNet, to, amount!, tokenBalance);

    console.info('CrossChain', extrinsic);

    const [fee, crossChainFee] = await estimateCrossChainFee(originNet, destinationNet, tokenBalance, extrinsic);

    return {
      estimateFee: fee.toString(),
      destEstimateFee: crossChainFee.toString(),
    } as ResponseCheckCrossChain;
  }

  private async makeCrossChain(
    id: string,
    port: Port,
    {
      from,
      originNet: originNetKey,
      destinationNet,
      amount,
      password,
      to,
      assetId,
      isSavePass,
      isMobile,
    }: RequestCrossChain
  ): Promise<void> {
    const originNet = this.state.getNetworkByKey(originNetKey)?.name ?? '';
    const [, fromKeyPair] = this.validateTransfer(assetId, from, password);

    const cb = createSubscription<'pri(accounts.crossChain)'>(id, port);

    const address = getSubstrateAddress(from);
    const substratePair = keyring.getPair(address);
    const ethereumAddress = substratePair.meta.ethereumAddress as string;

    const remainTime = this.getRemainingTime(substratePair);

    const savePass = () => {
      this.savePass(address, ethereumAddress, remainTime, !!isSavePass, !!isMobile);
    };

    const callback = this.makeExtrinsicCallback(cb, savePass);

    const transferProm: Promise<void> | undefined = makeCrossChain({
      assetId,
      originNet,
      destinationNet,
      amount: amount ?? '0',
      from: fromKeyPair!.address,
      to,
      password,
      isSavePass,
      callback,
    });

    transferProm
      .then(() =>
        console.info(`
          Start crossChain amount: ${amount}
          [${originNet}] => [${destinationNet}]
          from ${from}
          to ${to}
        `)
      )
      .catch((e) => {
        cb({
          txError: true,
          status: false,
          errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: (e as Error).message }],
        });

        console.error('CrossChain error', e);

        setTimeout(() => this.cancelSubscription(id), 500);

        // todo: add condition to lock KeyPair
      });

    port.onDisconnect.addListener(() => this.cancelSubscription(id));
  }

  private getNetworkMap(): Record<string, NetworkJson> {
    return this.state.getNetworkMap;
  }

  private createMobileWallet(wallet: RequestAddressCreate) {
    this.createAddress(wallet);

    this.updateCurrentAccountAddress(wallet.address);
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

      case 'pri(networkMap.upsert)':
        return this.upsertNetworkMap(request as NetworkJson);

      case 'pri(networkMap.toggle.favorite)':
        return this.toggleNetworkFavorite(request as string);

      case 'pri(networkMap.getSubscription)':
        return this.subscribeNetworkMap(id, port);

      case 'pri(networkMap.getNetworkMap)':
        return this.getNetworkMap();

      case 'pri(authorize.approve)':
        return this.authorizeApprove(request as RequestAuthorizeApprove);

      case 'pri(soraCard.token)':
        return this.soraCardTokenSubscribe(id, port);

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

      case 'pri(accounts.create.mobile)':
        return this.createMobileWallet(request as RequestAddressCreate);

      case 'pri(addresses.remove)':
        return this.removeAddress(request as string);

      case 'pri(addresses.get)':
        return this.getAddresses();

      case 'pri(authorize.update)':
        return this.authorizeUpdate(request as RequestUpdateAuthorizedAccounts);

      case 'pri(accounts.create.external)':
        return this.accountsCreateExternal(request as RequestAccountCreateExternal);

      case 'pri(accounts.validate.path)':
        return this.validateDerivationPath(request as DerivationPath);

      case 'pri(accounts.create.suri)':
        return this.accountsCreateSuri(request as RequestAccountCreateSuri);

      case 'pri(price.update.currency)':
        return this.updateCurrencySymbol(request as string);

      case 'pri(price.get.price)':
        return this.getPrice();

      case 'pri(price.get.subscription)':
        return this.subscribePrice(id, port);

      case 'pri(accounts.update.current)':
        return this.updateCurrentAccountAddress(request as string);

      case 'pri(accounts.update.currentNetwork)':
        return this.enableNetworkType(request as string);

      case 'pri(accounts.update.meta)':
        return this.updatePairMeta(request as RequestUpdateMeta);

      case 'pri(accounts.export)':
        return this.accountsExport(request as RequestAccountExport);

      case 'pri(accounts.batchExport)':
        return this.accountsBatchExport(request as RequestAccountBatchExport);

      case 'pri(accounts.forget)':
        return this.accountsForget(request as RequestAccountForget);

      case 'pri(accounts.show)':
        return this.accountsShow(request as RequestAccountShow);

      case 'pri(accounts.subscribe)':
        return this.accountsSubscribe(id, port);

      case 'pri(addresses.subscribe)':
        return this.addressesSubscribe(id, port);

      case 'pri(accounts.triggerSubscription)':
        return this.triggerWalletsSubscription();

      case 'pri(accounts.tie)':
        return this.accountsTie(request as RequestAccountTie);

      case 'pri(accounts.name)':
        return this.accountUpdateName(request as RequestAccountName);

      case 'pri(accounts.validate)':
        return this.accountsValidatePassword(request as RequestAccountValidate);

      case 'pri(metadata.approve)':
        return this.metadataApprove(request as RequestMetadataApprove);

      case 'pri(metadata.get)':
        return this.metadataGet(request as string);

      case 'pri(metadata.list)':
        return this.metadataList();

      case 'pri(metadata.reject)':
        return this.metadataReject(request as RequestMetadataReject);

      case 'pri(metadata.requests)':
        return port && this.metadataSubscribe(id, port);

      case 'pri(activeTabsUrl.update)':
        return this.updateCurrentTabs(request as RequestActiveTabsUrlUpdate);

      case 'pri(derivation.create)':
        return this.derivationCreate(request as RequestDeriveCreate);

      case 'pri(derivation.validate)':
        return this.derivationValidate(request as RequestDeriveValidate);

      case 'pri(json.restore)':
        return this.jsonRestore(request as RequestJsonRestore);

      case 'pri(json.valid)':
        return this.jsonValid(request as RequestJsonRestore);

      case 'pri(json.batchRestore)':
        return this.batchRestore(request as RequestBatchRestore);

      case 'pri(json.account.info)':
        return this.jsonGetAccountInfo(request as KeyringPair$Json);

      case 'pri(seed.create)':
        return this.seedCreate(request as RequestSeedCreate);

      case 'pri(seed.validate)':
        return this.seedValidate(request as RequestSeedValidate);

      case 'pri(signing.approve.password)':
        return this.signingApprovePassword(request as RequestSigningApprovePassword);

      case 'pri(signing.approve.signature)':
        return this.signingApproveSignature(request as RequestSigningApproveSignature);

      case 'pri(signing.cancel)':
        return this.signingCancel(request as RequestSigningCancel);

      case 'pri(mobileSigning.cancel)':
        return this.mobileSigningCancel(request as RequestSigningCancel);

      case 'pri(signing.isLocked)':
        return this.signingIsLocked(request as RequestSigningIsLocked);

      case 'pri(signing.requests)':
        return this.signingSubscribe(id, port);

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

      case 'pri(balance.get.balance)':
        return this.getBalance();

      case 'pri(accounts.get.totalBalances)':
        return this.getTotalBalances();

      case 'pri(balance.get.subscription)':
        return this.subscribeBalance(id, port);

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

      case 'pri(accounts.get.soraFees)':
        return this.getSoraFees();

      case 'pri(transaction.history.add)':
        return this.updateTransactionHistory(request as RequestTransactionHistoryAdd, id, port);

      case 'pri(transaction.history.get.subscription)':
        return this.subscribeHistory(id, port);

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
