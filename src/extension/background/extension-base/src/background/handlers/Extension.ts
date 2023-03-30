// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ALLOWED_PATH, PASSWORD_EXPIRY_MS } from '@extension-base/defaults';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { hexToU8a, isHex, assert, BN, BN_ZERO } from '@polkadot/util';
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
  ActiveTabAuthorizeStatus,
  BalanceJson,
  BasicTxError,
  BasicTxErrorCode,
  BasicTxResponse,
  BasicTxWarning,
  BasicTxWarningCode,
  CachedUnlocks,
  Port,
  PriceJson,
  RequestAccountExportPrivateKey,
  RequestCheckSwap,
  RequestCheckTransfer,
  RequestCurrentAccountAddress,
  RequestJsonValidate,
  RequestSwap,
  RequestTransfer,
  ResponseAccountExportPrivateKey,
  ResponseCheckTransfer,
  ResponseCreateAccountSuri,
  TransferErrorCode,
  ValidateJsonResult,
} from '../types/types';
import { CurrentAccountInfo } from '../../stores/CurrentAccountStore';
import {
  NetworkJsonOld,
  RequestTransactionHistoryAdd,
  RequestTransactionHistoryGet,
  TransactionHistoryItemType,
} from '../../types';
import { ALL_GENESIS_HASH } from '../../const';
import { fetchHistory } from '../../api/evm/history';
import { NetworkJson } from '../../api/evm/types/ether';
import {
  getERC20TransactionObject,
  getEVMTransactionObject,
  getExistentialDeposit,
  makeERC20Transfer,
  makeEVMTransfer,
} from '../../api/evm/transfer';
import { checkMainToken } from '../../api/substrate/balance';
import { estimateFee, makeTransfer } from '../../api/substrate/transfer';
import { getTokenInfo } from '../../api/substrate/registry';
import { withErrorLog } from './helpers';
import State, { registry } from './State';
import { createSubscription, unsubscribe } from './subscriptions';
import { state } from '.';
import type { KeyringPair$Json, KeyringPair, KeyringPair$Meta } from '@polkadot/keyring/types';
import type {
  AccountJson,
  AllowedPath,
  AuthorizedAccountsDiff,
  AuthorizeRequest,
  GoogleFileId,
  MessageTypes,
  MetadataRequest,
  RequestAccountBatchExport,
  RequestAccountCreateExternal,
  RequestAccountCreateHardware,
  RequestAccountCreateSuri,
  RequestAccountEdit,
  RequestAccountExport,
  RequestAccountForget,
  RequestAccountShow,
  RequestAccountTie,
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
  RequestSaveTimeoutCache,
  RequestSigningCancel,
  RequestSigningIsLocked,
  RequestTypes,
  RequestUpdateAuthorizedAccounts,
  ResponseAccountExport,
  ResponseAccountsExport,
  ResponseAuthorizeList,
  ResponseDeriveValidate,
  ResponseJsonGetAccountInfo,
  ResponseSeedCreate,
  ResponseSeedValidate,
  ResponseSigningIsLocked,
  ResponseType,
  SigningRequest,
} from '../types/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { MetadataDef } from '@polkadot/extension-inject/types';
import { VALID_MNEMONIC } from '@/consts/derivationPath';
import { googleManage } from '@/controllers/googleController';
import {
  AssetJson,
  DerivationPath,
  FilesResponse,
  GoogleAuthTypes,
  ICreateFile,
  IGetFilesResponse,
  VerifyTokenResponse,
} from '@/interfaces';
import { getMetaTyped } from '@/helpers/common';

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
  const currentAccount = await new Promise<CurrentAccountInfo | undefined>((res) => {
    state.getCurrentAccount((value) => {
      res(value);
    });
  });

  const transformedAccounts = Object.values(accounts)
    .filter((el) => !isEthereumAddress(el.json.address))
    .map(
      ({ json: { address, meta }, type }): AccountJson => ({
        address,
        ethereumAddress: meta.ethereumAddress as string,
        active: address === currentAccount?.address ? true : false,
        name: meta.name ?? '',
        type,
        ...meta,
      })
    );

  return transformedAccounts;
}

export default class Extension {
  private token: string;
  protected cachedUnlocks: CachedUnlocks;

  constructor() {
    this.cachedUnlocks = {};
    this.token = '';
  }

  private cancelSubscription(id: string): boolean {
    return state.cancelSubscription(id);
  }

  accountsCreateExternal({ address, genesisHash, name }: RequestAccountCreateExternal): boolean {
    keyring.addExternal(address, { genesisHash, name });

    return true;
  }

  accountsCreateHardware({
    accountIndex,
    address,
    addressOffset,
    genesisHash,
    hardwareType,
    name,
  }: RequestAccountCreateHardware): boolean {
    keyring.addHardware(address, hardwareType, { accountIndex, addressOffset, genesisHash, name });

    return true;
  }

  validateDerivationPath({ value, keypairType }: DerivationPath): boolean {
    try {
      keyring.createFromUri(`${VALID_MNEMONIC}${value}`, {}, keypairType);

      return true;
    } catch {
      return false;
    }
  }

  async accountsCreateSuri({
    password,
    suri,
    type,
    meta,
  }: RequestAccountCreateSuri): Promise<ResponseCreateAccountSuri> {
    const { pair } = keyring.addUri(suri, password, meta, type);
    const { address } = pair;
    const metaData = getMetaTyped(pair.meta);

    if (isEthereumAddress(address)) {
      metaData.ethereumAddress = address;
      keyring.saveAccountMeta(pair, metaData as any);

      return {
        name: metaData.name,
        address: address,
        ethereumAddress: metaData.ethereumAddress,
        isMobile: metaData.isMobile,
      };
    }

    await this.updateCurrentAccountAddress(address);

    return {
      name: metaData.name,
      address,
      ethereumAddress: metaData.ethereumAddress,
      isMobile: metaData.isMobile,
    };
  }

  accountsExport({ address, password }: RequestAccountExport): ResponseAccountExport {
    return { exportedJson: keyring.backupAccount(keyring.getPair(address), password) };
  }

  async accountsBatchExport({ addresses, password }: RequestAccountBatchExport): Promise<ResponseAccountsExport> {
    return {
      exportedJson: await keyring.backupAccounts(addresses, password),
    };
  }

  async accountsForget({ address, type }: RequestAccountForget): Promise<boolean> {
    const authorizedAccountsDiff: AuthorizedAccountsDiff = [];

    // cycle through authUrls and prepare the array of diff
    Object.entries(state.authUrls).forEach(([url, urlInfo]) => {
      if (!urlInfo.authorizedAccounts.includes(address)) {
        return;
      }

      authorizedAccountsDiff.push([
        url,
        urlInfo.authorizedAccounts.filter((previousAddress) => previousAddress !== address),
      ]);
    });

    state.updateAuthorizedAccounts(authorizedAccountsDiff);

    //  cycle through default account selection for auth and remove any occurence of the account
    if (!isEthereumAddress(address)) {
      const newDefaultAuthAccounts = state.defaultAuthAccountSelection.filter(
        (defaultSelectionAddress) => defaultSelectionAddress !== address
      );
      state.updateDefaultAuthAccounts(newDefaultAuthAccounts);
    }

    if (type === 'native') {
      const pair = keyring.getAccount(address);
      const ethereumAddress = pair?.meta.ethereumAddress as string;

      if (ethereumAddress !== '') keyring.forgetAccount(ethereumAddress);

      keyring.forgetAccount(address);
    } else keyring.forgetAddress(address);

    const accounts = keyring.getAccounts();
    const currentAcc = await new Promise<CurrentAccountInfo | undefined>((res) => {
      state.getCurrentAccount((value) => {
        res(value);
      });
    });

    const shouldUpdate = !accounts.some((el) => el.address === currentAcc?.address);

    if (shouldUpdate) {
      const account = accounts.find((el) => !isEthereumAddress(el.address));
      const currentAccount = account
        ? {
            address,
            name: account.meta.name as string,
            ethereumAddress: account.meta.ethereumAddress as string,
            currentGenesisHash: account.meta.genesisHash ?? null,
            isMobile: (account.meta.isMobile as boolean) ?? false,
          }
        : undefined;

      this.updateCurrentAccountAddress(currentAccount ? currentAccount.address : '');
    }

    return true;
  }

  async refreshAccountPasswordCache(pair: KeyringPair): Promise<number> {
    const { address } = pair;
    // const { cachedUnlocks } = await state.getFromStorage(['cachedUnlocks']);
    const savedExpiry = this.cachedUnlocks[address] || 0;
    const remainingTime = savedExpiry - Date.now();

    if (remainingTime < 0) {
      this.cachedUnlocks[address] = 0;

      pair.lock();

      return 0;
    }

    return remainingTime;
  }

  public encodeAddress = (key: string | Uint8Array, ss58Format = 42): string => {
    return keyring.encodeAddress(key, ss58Format);
  };

  public decodeAddress = (key: string | Uint8Array, ignoreChecksum?: boolean, ss58Format?: number): Uint8Array => {
    return keyring.decodeAddress(key, ignoreChecksum, ss58Format);
  };

  resetTimeouts(): boolean {
    const newCachedUnlocks: CachedUnlocks = {};

    Object.keys(this.cachedUnlocks).forEach((address) => (newCachedUnlocks[address] = 0));

    this.cachedUnlocks = newCachedUnlocks;

    return true;
  }

  accountsShow({ address, isShowing }: RequestAccountShow): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, isHidden: !isShowing });

    return true;
  }

  accountsTie({ address, genesisHash }: RequestAccountTie): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, genesisHash });

    return true;
  }

  accountsValidate({ address, password }: RequestAccountValidate): boolean {
    try {
      keyring.backupAccount(keyring.getPair(address), password);

      return true;
    } catch (e) {
      return false;
    }
  }

  accountsSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(accounts.subscribe)'>(id, port);
    const subscription = accountsObservable.subject.subscribe((accounts: SubjectInfo): void => {
      if (Object.values(accounts).length % 2 === 0) transformAccounts(accounts).then(cb);
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  async authorizeApprove({ authorizedAccounts, id }: RequestAuthorizeApprove): Promise<boolean> {
    const queued = await state.getAuthRequest(id);

    assert(queued, 'Unable to find request');

    const { resolve } = queued;
    resolve({ authorizedAccounts, result: true });

    return true;
  }

  async authorizeUpdate({ authorizedAccounts, url }: RequestUpdateAuthorizedAccounts): Promise<void> {
    return state.updateAuthorizedAccounts([[url, authorizedAccounts]]);
  }

  async getAuthList(): Promise<ResponseAuthorizeList> {
    return { list: state.authUrls };
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
        const authorizeUrl = Object.keys(state.authUrls).filter((url) => url === tabHostName);
        const isAuthorize = authorizeUrl.length !== 0;

        resolve({
          isAuthorize,
          authorizeAccountsCount: isAuthorize ? state.authUrls[tabHostName].authorizedAccounts.length : 0,
          dAppName: tabHostName,
        });
      });
    });
  }

  authorizeSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(authorize.requests)'>(id, port);

    const subscription = state.authSubject.subscribe((requests: AuthorizeRequest[]): void => cb(requests));

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  async metadataApprove({ id }: RequestMetadataApprove): Promise<boolean> {
    const queued = state.getMetaRequest(id);

    assert(queued, 'Unable to find request');

    const { request, resolve } = await queued;

    state.saveMetadata(request);

    resolve(true);

    return true;
  }

  metadataGet(genesisHash: string | null): MetadataDef | null {
    return state.knownMetadata.find((result) => result.genesisHash === genesisHash) || null;
  }

  metadataList(): MetadataDef[] {
    return state.knownMetadata;
  }

  async metadataReject({ id }: RequestMetadataReject): Promise<boolean> {
    const queued = await state.getMetaRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    reject(new Error('Rejected'));

    return true;
  }

  metadataSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(metadata.requests)'>(id, port);
    // const { metaSubject } = await state.getFromStorage(['metaSubject']);

    const subscription = state.metaSubject.subscribe((requests: MetadataRequest[]): void => cb(requests));

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
          this._saveCurrentAccountAddress(address, () => {
            const pair = keyring.restoreAccount(file, password);

            resolve(pair.address);
          });
        } catch (error) {
          reject({ error: (error as Error).message });
        }
      });
    } else {
      throw new Error('Unable to decode using the supplied passphrase');
    }
  }

  jsonValid({ file, password, isSubstrate }: RequestJsonValidate): ValidateJsonResult {
    try {
      const pair = keyring.restoreAccount(file, password);
      pair.decodePkcs8(password);
      if (isSubstrate) keyring.encodeAddress(pair.address);

      return { value: true };
    } catch (error: any) {
      const errorType =
        error.message === 'Unable to decode using the supplied passphrase' ? 'jsonPassword' : 'jsonInvalid';

      return { value: false, errorType };
    }
  }

  batchRestore({ file, password }: RequestBatchRestore): void {
    try {
      keyring.restoreAccounts(file, password);
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }

  jsonGetAccountInfo(json: KeyringPair$Json): ResponseJsonGetAccountInfo {
    try {
      const {
        address,
        meta: { genesisHash, name, ethereumAddress },
        type,
      } = keyring.createFromJson(json);

      return {
        address,
        ethereumAddress,
        genesisHash,
        name,
        type,
      } as ResponseJsonGetAccountInfo;
    } catch (e) {
      console.error(e);
      throw new Error((e as Error).message);
    }
  }

  private async enableNetworkMap(networkKey: string): Promise<boolean> {
    const networkMap = this.getNetworkMap();

    if (!(networkKey in networkMap)) {
      return false;
    }

    return state.enableNetworkMap(networkKey);
  }

  private async upsertNetworkMap(data: NetworkJsonOld): Promise<boolean> {
    try {
      return await state.upsertNetworkMap(data);
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
  private _saveCurrentAccountAddress(address: string, callback?: (data: CurrentAccountInfo | undefined) => void) {
    const currentKeyPair = keyring.getAccount(address);

    const accountInfo: CurrentAccountInfo = {
      address,
      isMobile: (currentKeyPair?.meta.isMobile as boolean) ?? false,
      name: currentKeyPair?.meta.name as string,
      ethereumAddress: (currentKeyPair?.meta.ethereumAddress as string) ?? '',
      currentGenesisHash: ALL_GENESIS_HASH,
      allGenesisHash: ALL_GENESIS_HASH || undefined,
    };

    state.setCurrentAccount(accountInfo, () => {
      callback && callback(accountInfo);
    });
  }

  private triggerAccountsSubscription(): boolean {
    const accountsSubject = accountsObservable.subject;

    accountsSubject.next(accountsSubject.getValue());

    return true;
  }

  private updateCurrentAccountAddress(address: string): boolean {
    this._saveCurrentAccountAddress(address, () => {
      this.triggerAccountsSubscription();
      state.publishBalance();
    });

    return true;
  }

  private saveCurrentAccountAddress(data: RequestCurrentAccountAddress, id: string, port: Port): boolean {
    const cb = createSubscription<'pri(accounts.current.saveAddress)'>(id, port);

    this._saveCurrentAccountAddress(data.address, cb);

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
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

  async signingApprovePassword({ id, password, savePass }: RequestSigningApprovePassword): Promise<boolean> {
    const queued = await state.getSignRequest(id);

    assert(queued, 'Unable to find request');

    const { reject, request, resolve } = queued;
    const pair = keyring.getPair(queued.account.address);

    if (!pair) {
      reject(new Error('Unable to find pair'));

      return false;
    }

    const { address } = pair;

    await this.refreshAccountPasswordCache(pair);

    // if the keyring pair is locked, the password is needed
    if (pair.isLocked && !password) reject(new Error('Password needed to unlock the account'));

    if (pair.isLocked) pair.decodePkcs8(password);

    const { payload } = request;

    if (isJsonPayload(payload)) {
      // Get the metadata for the genesisHash
      const currentMetadata = state.knownMetadata.find((meta: MetadataDef) => meta.genesisHash === payload.genesisHash);

      // set the registry before calling the sign function
      registry.setSignedExtensions(payload.signedExtensions, currentMetadata?.userExtensions);

      if (currentMetadata) {
        registry.register(currentMetadata?.types);
      }
    }

    const result = request.sign(registry, pair);

    if (savePass) this.cachedUnlocks[address] = Date.now() + PASSWORD_EXPIRY_MS;
    else pair.lock();

    resolve({
      id,
      ...result,
    });

    return true;
  }

  async saveTimeoutCache(address: string): Promise<boolean> {
    const { cachedUnlocks } = await state.getFromStorage(['cachedUnlocks']);

    cachedUnlocks[address] = Date.now() + PASSWORD_EXPIRY_MS;

    await chrome.storage.local.set({ cachedUnlocks });

    return true;
  }

  async signingApproveSignature({ id, signature }: RequestSigningApproveSignature): Promise<boolean> {
    State.signature = signature;
    const queued = await state.getSignRequest(id);

    assert(queued, 'Unable to find request');

    const { resolve } = queued;

    resolve({ id, signature });

    return true;
  }

  async signingCancel({ id }: RequestSigningCancel): Promise<boolean> {
    const queued = await state.getSignRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    reject(new Error('Cancelled'));

    return true;
  }

  async signingIsLocked({ address }: RequestSigningIsLocked): Promise<ResponseSigningIsLocked> {
    // const queued = await state.getSignRequest(id);
    // assert(queued, 'Unable to find request');
    // const address = queued.request.payload.address;

    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    const remainingTime = await this.refreshAccountPasswordCache(pair);

    return {
      isLocked: pair.isLocked,
      remainingTime,
    };
  }

  signingSubscribe(id: string, port: Port): boolean {
    const cb = createSubscription<'pri(signing.requests)'>(id, port);
    // const { signSubject } = await state.getFromStorage(['signSubject']);

    const subscription = state.signSubject.subscribe((requests: SigningRequest[]): void => cb(requests));

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

    const url = `${chrome.runtime.getURL('popup.html')}#${path}`;

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
    const list = await state.removeAuthorization(url);

    return { list };
  }

  async deleteAuthRequest(requestId: string): Promise<void> {
    return state.deleteAuthRequest(requestId);
  }

  updateCurrentTabs({ tabs }: RequestActiveTabsUrlUpdate) {
    state.updateCurrentTabsUrl(tabs);
  }

  getConnectedTabsUrl() {
    return state.getConnectedTabsUrl();
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

  async verifyToken({ token }: { token: string }): Promise<VerifyTokenResponse> {
    return googleManage.verifyToken(token);
  }

  getToken(): void {
    chrome.identity.getAuthToken({}, (token) => {
      this.token = token;
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
    state.authorizeCancel({ id });
  }

  private createUnsubscriptionHandle(id: string, unsubscribe: () => void): void {
    state.createUnsubscriptionHandle(id, unsubscribe);
  }

  private getBalance(reset?: boolean): Promise<BalanceJson> {
    return state.getBalance(reset);
  }

  private subscribeBalance(id: string, port: Port): Promise<BalanceJson> {
    const cb = createSubscription<'pri(balance.get.subscription)'>(id, port);

    const balanceSubscription = state.subscribeBalance().subscribe({
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

  private subscribeHistory(id: string, port: chrome.runtime.Port): Record<string, TransactionHistoryItemType[]> {
    const cb = createSubscription<'pri(transaction.history.get.subscription)'>(id, port);

    const historySubscription = state.subscribeHistory().subscribe({
      next: (rs) => {
        cb(rs);
      },
    });

    this.createUnsubscriptionHandle(id, historySubscription.unsubscribe);

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
    });

    return state.getHistoryMap();
  }

  private getHistory({ address, networkKey, token }: RequestTransactionHistoryGet) {
    return fetchHistory(address, networkKey, token);
  }

  private updateTransactionHistory(
    { address, item, networkKey }: RequestTransactionHistoryAdd,
    id: string,
    port: Port
  ): boolean {
    const cb = createSubscription<'pri(transaction.history.add)'>(id, port);

    state.setHistory(address, networkKey, item, (items) => {
      cb(items);
    });

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
    });

    return true;
  }

  private getPrice(): Promise<PriceJson> {
    return new Promise<PriceJson>((resolve) => {
      state.getPrice((rs: PriceJson) => {
        resolve(rs);
      });
    });
  }

  private subscribePrice(id: string, port: chrome.runtime.Port): Promise<PriceJson> {
    const cb = createSubscription<'pri(price.get.subscription)'>(id, port);

    const priceSubscription = state.subscribePrice().subscribe({
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

  private async isInWalletAccount(address?: string) {
    return new Promise((resolve) => {
      if (address) {
        accountsObservable.subject.subscribe((storedAccounts: SubjectInfo): void => {
          if (storedAccounts[address]) {
            resolve(true);
          }

          resolve(false);
        });
      } else {
        resolve(false);
      }
    });
  }

  private makeTransferCallback(
    address: string,
    recipientAddress: string,
    networkKey: string,
    token: string | undefined,
    portCallback: (res: BasicTxResponse) => void
  ): (res: BasicTxResponse) => void {
    return (res: BasicTxResponse) => {
      // !res.isFinalized to prevent duplicate action
      if (!res.isFinalized && res.txResult && res.extrinsicHash) {
        const transaction = {
          time: Date.now(),
          networkKey,
          change: res.txResult.change,
          changeSymbol: res.txResult.changeSymbol || token,
          fee: res.txResult.fee,
          feeSymbol: res.txResult.feeSymbol,
          isSuccess: !!res.status,
          extrinsicHash: res.extrinsicHash,
        } as TransactionHistoryItemType;

        state.setHistory(address, networkKey, { ...transaction, action: 'send' });

        // this.isInWalletAccount(recipientAddress)
        //   .then((isValid) => {
        //     if (isValid) {
        //       state.setHistory(recipientAddress, networkKey, { ...transaction, action: 'received' });
        //     } else {
        //       console.info(`The recipient address [${recipientAddress}] is not in wallet.`);
        //     }
        //   })
        //   .catch((err) => console.warn(err));
      }

      portCallback(res);
    };
  }

  private async validateSwap(request: RequestCheckSwap) {
    //
  }

  private async makeSwap(id: string, port: Port, { isSavePass }: RequestSwap) {
    //
  }

  private async validateTransfer(
    networkKey: string,
    token: string,
    from: string,
    to: string,
    password: string | undefined,
    value: string | undefined,
    transferAll: boolean | undefined
  ): Promise<[Array<BasicTxError>, KeyringPair | undefined, BN | undefined, AssetJson]> {
    const dotSamaApiMap = state.getSubstrateApiMap;
    const errors = [] as Array<BasicTxError>;
    let keypair: KeyringPair | undefined;
    let transferValue;

    if (!transferAll) {
      try {
        if (value === undefined) {
          errors.push({
            code: TransferErrorCode.INVALID_VALUE,
            message: 'Require transfer value',
          });
        }

        if (value) transferValue = new BN(Number(value));
      } catch (e) {
        errors.push({
          code: TransferErrorCode.INVALID_VALUE,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          message: String(e.message),
        });
      }
    }

    try {
      keypair = keyring.getPair(from);

      keypair.unlock(password);
    } catch (e: any) {
      errors.push({
        code: BasicTxErrorCode.KEYRING_ERROR,
        message: String(e.message),
      });
    }

    const tokenInfo = await getTokenInfo(networkKey, dotSamaApiMap[networkKey].api, token);

    // if (!tokenInfo) {
    //   errors.push({
    //     code: TransferErrorCode.INVALID_TOKEN,
    //     message: 'Not found token from registry',
    //   });
    // }

    // const isMainToken = await checkMainToken(networkKey, tokenInfo?.id);

    // if (isEthereumAddress(from) && isEthereumAddress(to) && tokenInfo && !isMainToken && !tokenInfo?.contractAddress) {
    //   errors.push({
    //     code: TransferErrorCode.INVALID_TOKEN,
    //     message: 'Not found ERC20 address for this token',
    //   });
    // }

    return [errors, keypair, transferValue, tokenInfo];
  }

  private async checkTransfer({
    from,
    networkKey,
    to,
    token,
    relayChain,
    transferAll,
    value,
    password,
  }: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
    const [errors, fromKeyPair, valueNumber, tokenInfo] = await this.validateTransfer(
      networkKey,
      token,
      from,
      to,
      password,
      value,
      transferAll
    );

    const dotSamaApiMap = state.getSubstrateApiMap;
    const web3ApiMap = state.getApiMap.evm;
    let mainToken: string | undefined;
    let mainTokenDecimals: number | undefined;
    const warnings: BasicTxWarning[] = [];
    const isMainToken = checkMainToken(networkKey, tokenInfo.id);

    if (!isMainToken) {
      const mainNetwork = state.getNetworkMapByKey(networkKey);

      mainToken = mainNetwork.nativeToken as string;
      mainTokenDecimals = mainNetwork.decimals;
    }

    const address = this.encodeAddress(from);
    const existentialDeposit = await getExistentialDeposit(networkKey, token, state.getSubstrateApiMap);

    let fee = 0;
    let feeSymbol;
    let fromAccountFreeBalance = '0';
    const toAccountFreeBalance = '0';
    // const fromAccountNativeBalance = '0';

    const tokenBalance = state.balanceMap[address].find(
      (balance) => balance.name === token && balance.relayChain === relayChain
    )!;

    if (isEthereumAddress(from) && isEthereumAddress(to)) {
      const fromAccountFreeBalance =
        tokenBalance.balances.find((net) => net.name.toLowerCase() === networkKey.toLowerCase())?.total ?? '0';
      const txVal: string = transferAll ? fromAccountFreeBalance : value || '0';

      // Estimate with EVM API
      if (!isMainToken && tokenInfo.contractAddress) {
        [, , fee] = await getERC20TransactionObject(
          tokenInfo.contractAddress,
          networkKey,
          from,
          to,
          txVal,
          !!transferAll,
          web3ApiMap
        );
      } else {
        [, , fee] = await getEVMTransactionObject(networkKey, to, txVal, !!transferAll, web3ApiMap);
      }
    } else {
      // Estimate with DotSama API

      fee = await estimateFee(networkKey, fromKeyPair, to, value, !!transferAll, dotSamaApiMap, tokenBalance);

      fromAccountFreeBalance =
        tokenBalance.balances.find((net) => net.name.toLowerCase() === networkKey.toLowerCase())?.total ?? '0';
    }

    const fromAccountFreeNumber = new BN(Number(fromAccountFreeBalance));
    const feeNumber = new BN(fee);
    // const fromAccountNativeBalanceNumber = new BN(fromAccountNativeBalance);
    const existentialDepositNumber = new BN(existentialDeposit);
    const rawExistentialDeposit = Number(existentialDeposit) / Math.pow(10, tokenInfo.precision);

    if (!transferAll && value && feeNumber && valueNumber && valueNumber.gt(BN_ZERO)) {
      if (isMainToken) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        if (fromAccountFreeNumber.gt(valueNumber)) {
          if (!fromAccountFreeNumber.gte(valueNumber.add(feeNumber).add(existentialDepositNumber))) {
            if (existentialDepositNumber.gt(BN_ZERO)) {
              warnings.push({
                code: BasicTxWarningCode.NOT_ENOUGH_EXISTENTIAL_DEPOSIT,
                message: `Beware! This transaction might cause a total loss of assets in this account because it would lower your balance below the minimum threshold of ${rawExistentialDeposit} ${tokenInfo.symbol}`,
              });
            }

            const isEnoughBalanceToSend = fromAccountFreeNumber.gte(valueNumber.add(feeNumber));
            console.info(isEnoughBalanceToSend, valueNumber, feeNumber);

            if (!isEnoughBalanceToSend) {
              errors.push({
                code: TransferErrorCode.NOT_ENOUGH_FEE,
                message: `Not enough ${tokenInfo.symbol} to pay the network fee`,
              });
              // }
            }
          } else {
            errors.push({
              code: TransferErrorCode.NOT_ENOUGH_VALUE,
              message: 'Not enough balance free to make transfer',
            });
          }
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call

        if (fromAccountFreeNumber.gte(valueNumber)) {
          if (!fromAccountFreeNumber.gte(existentialDepositNumber.add(feeNumber))) {
            if (existentialDepositNumber.gt(BN_ZERO)) {
              warnings.push({
                code: BasicTxWarningCode.NOT_ENOUGH_EXISTENTIAL_DEPOSIT,
                message: `Beware! This transaction might cause a total loss of assets in this account because it would lower your balance below the minimum threshold of ${rawExistentialDeposit} ${
                  mainToken || ''
                }`,
              });
            }

            if (!fromAccountFreeNumber.gte(feeNumber)) {
              errors.push({
                code: TransferErrorCode.NOT_ENOUGH_FEE,
                message: `Not enough ${mainToken || ''} to pay the network fee`,
              });
              // }
            }
          }
        } else {
          errors.push({
            code: TransferErrorCode.NOT_ENOUGH_VALUE,
            message: 'Not enough balance free to make transfer',
          });
        }
      }
    }

    return {
      errors,
      warnings,
      fromAccountFree: fromAccountFreeBalance,
      toAccountFree: toAccountFreeBalance,
      estimateFee: fee.toString(),
      feeSymbol,
    } as ResponseCheckTransfer;
  }

  private accountExportPrivateKey({
    address,
    password,
  }: RequestAccountExportPrivateKey): ResponseAccountExportPrivateKey {
    return state.accountExportPrivateKey({ address, password });
  }

  private async makeTransfer(
    id: string,
    port: Port,
    { from, networkKey, password, to, token, transferAll, value, isSavePass }: RequestTransfer
  ): Promise<BasicTxResponse | undefined> {
    const txState: BasicTxResponse = {};

    const [errors, fromKeyPair, , tokenInfo] = await this.validateTransfer(
      networkKey,
      token,
      from,
      to,
      password,
      value,
      transferAll
    );

    if (errors.length) {
      txState.txError = true;
      txState.errors = errors;
      setTimeout(() => {
        this.cancelSubscription(id);
      }, 500);

      // todo: add condition to lock KeyPair (for example: not remember password)

      fromKeyPair && fromKeyPair.lock();

      return txState;
    }

    if (fromKeyPair) {
      const cb = createSubscription<'pri(accounts.transfer)'>(id, port);
      const callback = this.makeTransferCallback(from, to, networkKey, token, cb);

      let transferProm: Promise<void> | undefined;

      if (isEthereumAddress(from) && isEthereumAddress(to)) {
        // Make transfer with EVM API
        const { privateKey } = this.accountExportPrivateKey({ address: from, password });
        const web3ApiMap = state.getApiMap.evm;
        const isMainToken = tokenInfo ? checkMainToken(networkKey, tokenInfo.id) : false;

        if (tokenInfo && !isMainToken && tokenInfo.contractAddress) {
          transferProm = makeERC20Transfer(
            tokenInfo.contractAddress,
            networkKey,
            from,
            to,
            privateKey,
            value || '0',
            !!transferAll,
            web3ApiMap,
            callback
          );
        } else {
          transferProm = makeEVMTransfer(networkKey, to, privateKey, value || '0', !!transferAll, web3ApiMap, callback);
        }
      } else {
        const dotSamaApiMap = state.getSubstrateApiMap;

        // Make transfer with Dotsama API
        transferProm = makeTransfer({
          networkKey: networkKey,
          tokenInfo: tokenInfo,
          value: value!,
          from: fromKeyPair.address,
          to: to,
          dotSamaApiMap: dotSamaApiMap,
          transferAll: !!transferAll,
          isSavePass: isSavePass ?? false,
          callback: callback,
        });
      }

      transferProm
        .then(() => {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          console.info(`Start transfer ${transferAll ? 'all' : value} from ${from} to ${to}`);

          // todo: add condition to lock KeyPair
          //fromKeyPair.lock();
        })
        .catch((e) => {
          cb({
            txError: true,
            status: false,
            errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: (e as Error).message }],
          });
          console.error('Transfer error', e);
          setTimeout(() => {
            this.cancelSubscription(id);
          }, 500);

          // todo: add condition to lock KeyPair
          fromKeyPair.lock();
        });
    }

    port.onDisconnect.addListener((): void => {
      this.cancelSubscription(id);
    });

    return txState;
  }
  private getNetworkMap(): Record<string, NetworkJson> {
    return state.getNetworkMap;
  }

  private subscribeNetworkMap(id: string, port: Port): Record<string, NetworkJson> {
    const cb = createSubscription<'pri(networkMap.getSubscription)'>(id, port);
    const networkMapSubscription = state.subscribeNetworkMap().subscribe({
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

      case 'pri(networkMap.enableOne)':
        return this.enableNetworkMap(request as string);

      case 'pri(networkMap.upsert)':
        return this.upsertNetworkMap(request as NetworkJsonOld);

      case 'pri(networkMap.getSubscription)':
        return this.subscribeNetworkMap(id, port);

      case 'pri(networkMap.getNetworkMap)':
        return this.getNetworkMap();

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
        return port && (await this.authorizeSubscribe(id, port));

      case 'pri(addresses.create)':
        return this.createAddress(request as RequestAddressCreate);

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

      case 'pri(accounts.create.hardware)':
        return this.accountsCreateHardware(request as RequestAccountCreateHardware);

      case 'pri(accounts.create.suri)':
        return this.accountsCreateSuri(request as RequestAccountCreateSuri);

      case 'pri(price.get.price)':
        return await this.getPrice();

      case 'pri(price.get.subscription)':
        return await this.subscribePrice(id, port);

      case 'pri(accounts.current.saveAddress)':
        return this.saveCurrentAccountAddress(request as RequestCurrentAccountAddress, id, port as Port);

      case 'pri(accounts.update.current)':
        return this.updateCurrentAccountAddress(request as string);

      case 'pri(accounts.export)':
        return this.accountsExport(request as RequestAccountExport);

      case 'pri(accounts.batchExport)':
        return this.accountsBatchExport(request as RequestAccountBatchExport);

      case 'pri(accounts.forget)':
        return this.accountsForget(request as RequestAccountForget);

      case 'pri(accounts.show)':
        return this.accountsShow(request as RequestAccountShow);

      case 'pri(accounts.subscribe)':
        return this.accountsSubscribe(id, port as Port);

      case 'pri(accounts.tie)':
        return this.accountsTie(request as RequestAccountTie);

      case 'pri(accounts.validate)':
        return this.accountsValidate(request as RequestAccountValidate);

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

      case 'pri(connectedTabsUrl.get)':
        return this.getConnectedTabsUrl();

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

      case 'pri(settings.notification)':
        return state.setNotification(request as string);

      case 'pri(signing.approve.password)':
        return this.signingApprovePassword(request as RequestSigningApprovePassword);

      case 'pri(signing.approve.signature)':
        return this.signingApproveSignature(request as RequestSigningApproveSignature);

      case 'pri(signing.cancel)':
        return this.signingCancel(request as RequestSigningCancel);

      case 'pri(signing.isLocked)':
        return this.signingIsLocked(request as RequestSigningIsLocked);

      case 'pri(signing.requests)':
        return this.signingSubscribe(id, port as Port);

      case 'pri(window.open)':
        return this.windowOpen(request as AllowedPath);

      case 'pri(signing.resetTimeouts)':
        return this.resetTimeouts();

      case 'pri(signing.saveTimeoutCache)':
        return this.saveTimeoutCache(request as string);

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

      case 'pri(balance.get.subscription)':
        return this.subscribeBalance(id, port);

      /// Transfer
      case 'pri(accounts.checkTransfer)':
        return this.checkTransfer(request as RequestCheckTransfer);

      case 'pri(accounts.transfer)':
        return this.makeTransfer(id, port as Port, request as RequestTransfer);

      case 'pri(accounts.checkSwap)':
        return this.validateSwap(request as RequestCheckSwap);

      case 'pri(accounts.swap)':
        return this.makeSwap(id, port as Port, request as RequestSwap);

      case 'pri(transaction.history.add)':
        return this.updateTransactionHistory(request as RequestTransactionHistoryAdd, id, port as Port);

      case 'pri(transaction.history.get)':
        return this.getHistory(request as RequestTransactionHistoryGet);

      case 'pri(transaction.history.get.subscription)':
        return this.subscribeHistory(id, port as Port);

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
