// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ALLOWED_PATH, PASSWORD_EXPIRY_MS } from '@extension-base/defaults';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { assert, isHex } from '@polkadot/util';
import { keyExtractSuri, mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import { keyring } from '@polkadot/ui-keyring';
import {
  ActiveTabAuthorizeStatus,
  BalanceJson,
  CachedUnlocks,
  Port,
  PriceJson,
  RequestCurrentAccountAddress,
  SubscribeBalanceRequest,
} from '../types';
import { CurrentAccountInfo } from '../../stores/CurrentAccountStore';
import { RequestTransactionHistoryAdd, RequestTransactionHistoryGet, TransactionHistoryItemType } from '../../types';
import { ALL_GENESIS_HASH } from '../../const';
import { fetchHistory } from '../../api/evm/history';
import { withErrorLog } from './helpers';
import State, { registry } from './State';
import { createSubscription, unsubscribe } from './subscriptions';
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
  RequestAccountChangePassword,
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
} from '../types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { MetadataDef } from '@polkadot/extension-inject/types';
import { googleManage } from '@/controllers/googleController';
import { FilesResponse, GoogleAuthTypes, ICreateFile, IGetFilesResponse, VerifyTokenResponse } from '@/interfaces';

const SEED_DEFAULT_LENGTH = 12;
const SEED_LENGTHS = [12, 15, 18, 21, 24];
const ETH_DERIVE_DEFAULT = "/m/44'/60'/0'/0/0";

function getSuri(seed: string, type?: KeypairType): string {
  return type === 'ethereum' ? `${seed}${ETH_DERIVE_DEFAULT}` : seed;
}

function isJsonPayload(value: SignerPayloadJSON | SignerPayloadRaw): value is SignerPayloadJSON {
  return (value as SignerPayloadJSON).genesisHash !== undefined;
}

export default class Extension {
  private token: string;
  protected readonly cachedUnlocks: CachedUnlocks;

  readonly state: State;

  constructor(state: State) {
    this.cachedUnlocks = {};
    this.state = state;
    this.token = '';
  }

  async transformAccounts(accounts: SubjectInfo): Promise<AccountJson[]> {
    return Object.values(accounts).map(({ json: { address, meta }, type }): AccountJson => {
      return {
        address,
        isDefaultAuthSelected: this.state.defaultAuthAccountSelection.includes(address),
        ...meta,
        type,
      };
    });
  }

  private cancelSubscription(id: string): boolean {
    return this.state.cancelSubscription(id);
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

  async accountsCreateSuri({
    genesisHash,
    name,
    password,
    suri,
    type,
    meta,
  }: RequestAccountCreateSuri): Promise<boolean> {
    const currentAccount = await new Promise<CurrentAccountInfo | void>((resolve) => {
      this.state.getCurrentAccount(resolve);
    });
    const _suri = getSuri(suri, type);
    const address = keyring.createFromUri(_suri, {}, type).address;
    keyring.addUri(getSuri(suri, type), password, { genesisHash, name }, type);
    const allGenesisHash = currentAccount?.allGenesisHash || undefined;
    this.state.setCurrentAccount({
      address,
      ethereumAddress: (meta?.ethereumAddress as string) ?? '',
      currentGenesisHash: genesisHash || null,
      allGenesisHash,
    });

    return true;
  }

  accountsChangePassword({ address, newPass, oldPass }: RequestAccountChangePassword): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    try {
      if (!pair.isLocked) pair.lock();

      pair.decodePkcs8(oldPass);
    } catch (error) {
      throw new Error('oldPass is invalid');
    }

    keyring.encryptAccount(pair, newPass);

    return true;
  }

  accountsEdit({ address, name }: RequestAccountEdit): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, name });

    return true;
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

    // cycle through default account selection for auth and remove any occurence of the account
    const newDefaultAuthAccounts = this.state.defaultAuthAccountSelection.filter(
      (defaultSelectionAddress) => defaultSelectionAddress !== address
    );

    this.state.updateDefaultAuthAccounts(newDefaultAuthAccounts);

    type === 'native' ? keyring.forgetAccount(address) : keyring.forgetAddress(address);

    return true;
  }

  async refreshAccountPasswordCache(_pair: KeyringPair | string): Promise<number> {
    const pair = typeof _pair === 'string' ? keyring.getPair(_pair) : _pair;
    const { address } = pair;
    const { cachedUnlocks } = await this.state.getFromStorage(['cachedUnlocks']);
    const savedExpiry = cachedUnlocks[address] || 0;
    const remainingTime = savedExpiry - Date.now();

    if (remainingTime < 0) {
      cachedUnlocks[address] = 0;

      await chrome.storage.local.set({ cachedUnlocks });

      pair.lock();

      return 0;
    }

    await chrome.storage.local.set({ cachedUnlocks });

    return remainingTime;
  }

  async resetTimeouts(): Promise<boolean> {
    const { cachedUnlocks } = await this.state.getFromStorage(['cachedUnlocks']);
    const newCachedUnlocks: CachedUnlocks = {};

    Object.keys(cachedUnlocks).map((address) => (newCachedUnlocks[address] = 0));

    await chrome.storage.local.set({ cachedUnlocks: newCachedUnlocks });

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

  async accountsSubscribe(id: string, port: Port): Promise<boolean> {
    const cb = await createSubscription<'pri(accounts.subscribe)'>(id, port);
    const subscription = accountsObservable.subject.subscribe(async (accounts: SubjectInfo): Promise<void> => {
      const acc = await this.transformAccounts(accounts);

      return cb(acc);
    });

    port.onDisconnect.addListener((): void => {
      async () => {
        await unsubscribe(id);
      };

      subscription.unsubscribe();
    });

    return true;
  }

  async authorizeApprove({ authorizedAccounts, id }: RequestAuthorizeApprove): Promise<boolean> {
    const queued = await this.state.getAuthRequest(id);

    assert(queued, 'Unable to find request');

    const { resolve } = queued;
    resolve({ authorizedAccounts, result: true });

    return true;
  }

  async authorizeUpdate({ authorizedAccounts, url }: RequestUpdateAuthorizedAccounts): Promise<void> {
    return this.state.updateAuthorizedAccounts([[url, authorizedAccounts]]);
  }

  async getAuthList(): Promise<ResponseAuthorizeList> {
    return { list: this.state.authUrls };
  }

  async isTabAuthorize(): Promise<ActiveTabAuthorizeStatus> {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    if (!tab || !tab.url)
      return {
        isAuthorize: false,
        authorizeAccountsCount: 0,
        dAppName: '',
      };

    const tabHostName = new URL(tab.url).hostname;
    const authorizeUrl = Object.keys(this.state.authUrls).filter((url) => url === tabHostName);
    const isAuthorize = authorizeUrl.length !== 0;

    return {
      isAuthorize,
      authorizeAccountsCount: isAuthorize ? this.state.authUrls[tabHostName].authorizedAccounts.length : 0,
      dAppName: tabHostName,
    };
  }

  async authorizeSubscribe(id: string, port: Port): Promise<boolean> {
    const cb = await createSubscription<'pri(authorize.requests)'>(id, port);

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

    const { request, resolve } = await queued;

    this.state.saveMetadata(request);

    resolve(true);

    return true;
  }

  metadataGet(genesisHash: string | null): MetadataDef | null {
    return this.state.knownMetadata.find((result) => result.genesisHash === genesisHash) || null;
  }

  metadataList(): MetadataDef[] {
    return this.state.knownMetadata;
  }

  async metadataReject({ id }: RequestMetadataReject): Promise<boolean> {
    const queued = await this.state.getMetaRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    reject(new Error('Rejected'));

    return true;
  }

  async metadataSubscribe(id: string, port: Port): Promise<boolean> {
    const cb = await createSubscription<'pri(metadata.requests)'>(id, port);
    // const { metaSubject } = await this.state.getFromStorage(['metaSubject']);

    const subscription = this.state.metaSubject.subscribe((requests: MetadataRequest[]): void => cb(requests));

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  jsonRestore({ file, password }: RequestJsonRestore): void {
    try {
      keyring.restoreAccount(file, password);
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }

  jsonValid({ file, password }: RequestJsonRestore): boolean {
    try {
      keyring.restoreAccount(file, password);
    } catch (error) {
      return false;
    }

    return true;
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
        meta: { genesisHash, name },
        type,
      } = keyring.createFromJson(json);

      return {
        address,
        genesisHash,
        name,
        type,
      } as ResponseJsonGetAccountInfo;
    } catch (e) {
      console.error(e);
      throw new Error((e as Error).message);
    }
  }

  seedCreate({ length = SEED_DEFAULT_LENGTH, seed: _seed, type }: RequestSeedCreate): ResponseSeedCreate {
    const seed = _seed || mnemonicGenerate(length);

    return {
      address: keyring.createFromUri(getSuri(seed, type), {}, type).address,
      seed,
    };
  }
  private _saveCurrentAccountAddress(address: string, callback?: (data: CurrentAccountInfo) => void) {
    this.state.getCurrentAccount((accountInfo) => {
      if (!accountInfo) {
        accountInfo = {
          address,
          currentGenesisHash: ALL_GENESIS_HASH,
          allGenesisHash: ALL_GENESIS_HASH || undefined,
        };
      } else {
        accountInfo.address = address;

        if (address !== 'ALL') {
          const currentKeyPair = keyring.getAccount(address);

          accountInfo.currentGenesisHash = (currentKeyPair?.meta.genesisHash as string) || ALL_GENESIS_HASH;
        } else {
          accountInfo.currentGenesisHash = accountInfo.allGenesisHash || ALL_GENESIS_HASH;
        }
      }

      this.state.setCurrentAccount(accountInfo, () => {
        callback && callback(accountInfo);
      });
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
    });

    return true;
  }

  private saveCurrentAccountAddress(
    data: RequestCurrentAccountAddress,
    id: string,
    port: chrome.runtime.Port
  ): boolean {
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
    const queued = await this.state.getSignRequest(id);
    const { cachedUnlocks } = await this.state.getFromStorage(['cachedUnlocks']);

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
      const currentMetadata = this.state.knownMetadata.find(
        (meta: MetadataDef) => meta.genesisHash === payload.genesisHash
      );

      // set the registry before calling the sign function
      registry.setSignedExtensions(payload.signedExtensions, currentMetadata?.userExtensions);

      if (currentMetadata) {
        registry.register(currentMetadata?.types);
      }
    }

    const result = request.sign(registry, pair);
    cachedUnlocks[address] = Date.now() + PASSWORD_EXPIRY_MS;

    if (savePass) await chrome.storage.local.set({ cachedUnlocks });
    else pair.lock();

    resolve({
      id,
      ...result,
    });

    return true;
  }

  async saveTimeoutCache(address: string): Promise<boolean> {
    const { cachedUnlocks } = await this.state.getFromStorage(['cachedUnlocks']);

    cachedUnlocks[address] = Date.now() + PASSWORD_EXPIRY_MS;

    await chrome.storage.local.set({ cachedUnlocks });

    return true;
  }

  async signingApproveSignature({ id, signature }: RequestSigningApproveSignature): Promise<boolean> {
    State.signature = signature;
    const queued = await this.state.getSignRequest(id);

    assert(queued, 'Unable to find request');

    const { resolve } = queued;

    resolve({ id, signature });

    return true;
  }

  async signingCancel({ id }: RequestSigningCancel): Promise<boolean> {
    const queued = await this.state.getSignRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    reject(new Error('Cancelled'));

    return true;
  }

  async signingIsLocked({ id }: RequestSigningIsLocked): Promise<ResponseSigningIsLocked> {
    const queued = await this.state.getSignRequest(id);
    assert(queued, 'Unable to find request');
    const address = queued.request.payload.address;

    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    const remainingTime = await this.refreshAccountPasswordCache(pair);

    return {
      isLocked: pair.isLocked,
      remainingTime,
    };
  }

  // FIXME This looks very much like what we have in authorization
  async signingSubscribe(id: string, port: Port): Promise<boolean> {
    const cb = await createSubscription<'pri(signing.requests)'>(id, port);
    // const { signSubject } = await this.state.getFromStorage(['signSubject']);

    const subscription = this.state.signSubject.subscribe((requests: SigningRequest[]): void => cb(requests));

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
    const list = await this.state.removeAuthorization(url);

    return { list };
  }

  async deleteAuthRequest(requestId: string): Promise<void> {
    return this.state.deleteAuthRequest(requestId);
  }

  updateCurrentTabs({ urls }: RequestActiveTabsUrlUpdate) {
    this.state.updateCurrentTabsUrl(urls);
  }

  getConnectedTabsUrl() {
    return this.state.getConnectedTabsUrl();
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
    this.state.authorizeCancel({ id });
  }
  getBalance(reset?: boolean): BalanceJson {
    return this.state.getBalance(reset);
  }

  private createUnsubscriptionHandle(id: string, unsubscribe: () => void): void {
    this.state.createUnsubscriptionHandle(id, unsubscribe);
  }

  private subscribeBalance(id: string, port: chrome.runtime.Port): BalanceJson {
    const cb = createSubscription<'pri(balance.get.subscription)'>(id, port);

    const balanceSubscription = this.state.subscribeBalance().subscribe({
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

  private getHistory({ address, networkKey, token }: RequestTransactionHistoryGet) {
    return fetchHistory(address, networkKey, token);
  }

  private updateTransactionHistory(
    { address, item, networkKey }: RequestTransactionHistoryAdd,
    id: string,
    port: chrome.runtime.Port
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

  private getPrice(): Promise<PriceJson> {
    return new Promise<PriceJson>((resolve, reject) => {
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

  async handle<TMessageType extends MessageTypes>(
    id: string,
    type: TMessageType,
    request: RequestTypes[TMessageType],
    port?: Port
  ): Promise<ResponseType<TMessageType>> {
    switch (type) {
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

      case 'pri(accounts.create.hardware)':
        return this.accountsCreateHardware(request as RequestAccountCreateHardware);

      case 'pri(accounts.create.suri)':
        return this.accountsCreateSuri(request as RequestAccountCreateSuri);

      case 'pri(accounts.changePassword)':
        return this.accountsChangePassword(request as RequestAccountChangePassword);

      case 'pri(accounts.edit)':
        return this.accountsEdit(request as RequestAccountEdit);

      case 'pri(price.get.price)':
        return await this.getPrice();

      case 'pri(price.get.subscription)':
        return await this.subscribePrice(id, port as Port);

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
        return port && this.accountsSubscribe(id, port);

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
        return this.state.setNotification(request as string);

      case 'pri(signing.approve.password)':
        return this.signingApprovePassword(request as RequestSigningApprovePassword);

      case 'pri(signing.approve.signature)':
        return this.signingApproveSignature(request as RequestSigningApproveSignature);

      case 'pri(signing.cancel)':
        return this.signingCancel(request as RequestSigningCancel);

      case 'pri(signing.isLocked)':
        return await this.signingIsLocked(request as RequestSigningIsLocked);

      case 'pri(signing.requests)':
        return port && this.signingSubscribe(id, port);

      case 'pri(window.open)':
        return this.windowOpen(request as AllowedPath);

      case 'pri(signing.refreshPasswordTimeout)':
        return await this.refreshAccountPasswordCache(request as string);

      case 'pri(signing.resetTimeouts)':
        return await this.resetTimeouts();

      case 'pri(signing.saveTimeoutCache)':
        return await this.saveTimeoutCache(request as string);

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
        return this.subscribeBalance(id, port as Port);

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
