// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ALLOWED_PATH, PASSWORD_EXPIRY_MS } from '@extension-base/defaults';
import { accounts as accountsObservable } from '@polkadot/ui-keyring/observable/accounts';
import { assert, isHex } from '@polkadot/util';
import { keyExtractSuri, mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import { CachedUnlocks } from '../types';

import { withErrorLog } from './helpers';
import State, { registry } from './State';
import { createSubscription, unsubscribe } from './subscriptions';
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
import type { KeyringPair, KeyringPair$Json, KeyringPair$Meta } from '@polkadot/keyring/types';
import type { MetadataDef } from '@polkadot/extension-inject/types';
import { keyring } from '@/controllers/keyringChrome';
import { googleAuth } from '@/controllers/googleAuthController';
import { IGDriveFile, IGetFilesResponse } from '@/interfaces/google';

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
  private static token = '';
  static async transformAccounts(accounts: SubjectInfo): Promise<AccountJson[]> {
    return Object.values(accounts).map(({ json: { address, meta }, type }): AccountJson => {
      return {
        address,
        isDefaultAuthSelected: State.defaultAuthAccountSelection.includes(address),
        ...meta,
        type,
      };
    });
  }

  static accountsCreateExternal({ address, genesisHash, name }: RequestAccountCreateExternal): boolean {
    keyring.addExternal(address, { genesisHash, name });

    return true;
  }

  static accountsCreateHardware({
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

  static accountsCreateSuri({ genesisHash, name, password, suri, type }: RequestAccountCreateSuri): boolean {
    keyring.addUri(getSuri(suri, type), password, { genesisHash, name }, type);

    return true;
  }

  static accountsChangePassword({ address, newPass, oldPass }: RequestAccountChangePassword): boolean {
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

  static accountsEdit({ address, name }: RequestAccountEdit): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, name });

    return true;
  }

  static accountsExport({ address, password }: RequestAccountExport): ResponseAccountExport {
    return { exportedJson: keyring.backupAccount(keyring.getPair(address), password) };
  }

  static async accountsBatchExport({
    addresses,
    password,
  }: RequestAccountBatchExport): Promise<ResponseAccountsExport> {
    return {
      exportedJson: await keyring.backupAccounts(addresses, password),
    };
  }

  static async accountsForget({ address, type }: RequestAccountForget): Promise<boolean> {
    const authorizedAccountsDiff: AuthorizedAccountsDiff = [];

    // cycle through authUrls and prepare the array of diff
    Object.entries(State.authUrls).forEach(([url, urlInfo]) => {
      if (!urlInfo.authorizedAccounts.includes(address)) {
        return;
      }

      authorizedAccountsDiff.push([
        url,
        urlInfo.authorizedAccounts.filter((previousAddress) => previousAddress !== address),
      ]);
    });

    State.updateAuthorizedAccounts(authorizedAccountsDiff);

    // cycle through default account selection for auth and remove any occurence of the account
    const newDefaultAuthAccounts = State.defaultAuthAccountSelection.filter(
      (defaultSelectionAddress) => defaultSelectionAddress !== address
    );

    State.updateDefaultAuthAccounts(newDefaultAuthAccounts);

    type === 'native' ? keyring.forgetAccount(address) : keyring.forgetAddress(address);

    return true;
  }

  static async refreshAccountPasswordCache(_pair: KeyringPair | string): Promise<number> {
    const pair = typeof _pair === 'string' ? keyring.getPair(_pair) : _pair;
    const { address } = pair;
    const { cachedUnlocks } = await State.getFromStorage(['cachedUnlocks']);
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

  static async resetTimeouts(): Promise<boolean> {
    const { cachedUnlocks } = await State.getFromStorage(['cachedUnlocks']);
    const newCachedUnlocks: CachedUnlocks = {};

    Object.keys(cachedUnlocks).map((address) => (newCachedUnlocks[address] = 0));

    await chrome.storage.local.set({ cachedUnlocks: newCachedUnlocks });

    return true;
  }

  static accountsShow({ address, isShowing }: RequestAccountShow): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, isHidden: !isShowing });

    return true;
  }

  static accountsTie({ address, genesisHash }: RequestAccountTie): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, genesisHash });

    return true;
  }

  static accountsValidate({ address, password }: RequestAccountValidate): boolean {
    try {
      keyring.backupAccount(keyring.getPair(address), password);

      return true;
    } catch (e) {
      return false;
    }
  }

  static async accountsSubscribe(id: string, port: chrome.runtime.Port): Promise<boolean> {
    const cb = await createSubscription<'pri(accounts.subscribe)'>(id, port);
    const subscription = accountsObservable.subject.subscribe(async (accounts: SubjectInfo): Promise<void> => {
      const acc = await Extension.transformAccounts(accounts);

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

  static async authorizeApprove({ authorizedAccounts, id }: RequestAuthorizeApprove): Promise<boolean> {
    const queued = await State.getAuthRequest(id);

    assert(queued, 'Unable to find request');

    const { resolve } = queued;
    resolve({ authorizedAccounts, result: true });

    return true;
  }

  static async authorizeUpdate({ authorizedAccounts, url }: RequestUpdateAuthorizedAccounts): Promise<void> {
    return State.updateAuthorizedAccounts([[url, authorizedAccounts]]);
  }

  static async getAuthList(): Promise<ResponseAuthorizeList> {
    return { list: State.authUrls };
  }

  // FIXME This looks very much like what we have in accounts
  static async authorizeSubscribe(id: string, port: chrome.runtime.Port): Promise<boolean> {
    const cb = await createSubscription<'pri(authorize.requests)'>(id, port);

    const subscription = State.authSubject.subscribe((requests: AuthorizeRequest[]): void => cb(requests));

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  static async metadataApprove({ id }: RequestMetadataApprove): Promise<boolean> {
    const queued = State.getMetaRequest(id);

    assert(queued, 'Unable to find request');

    const { request, resolve } = await queued;

    State.saveMetadata(request);

    resolve(true);

    return true;
  }

  static metadataGet(genesisHash: string | null): MetadataDef | null {
    return State.knownMetadata.find((result) => result.genesisHash === genesisHash) || null;
  }

  static metadataList(): MetadataDef[] {
    return State.knownMetadata;
  }

  static async metadataReject({ id }: RequestMetadataReject): Promise<boolean> {
    const queued = await State.getMetaRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    reject(new Error('Rejected'));

    return true;
  }

  static async metadataSubscribe(id: string, port: chrome.runtime.Port): Promise<boolean> {
    const cb = await createSubscription<'pri(metadata.requests)'>(id, port);
    // const { metaSubject } = await State.getFromStorage(['metaSubject']);

    const subscription = State.metaSubject.subscribe((requests: MetadataRequest[]): void => cb(requests));

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  static jsonRestore({ file, password }: RequestJsonRestore): void {
    try {
      keyring.restoreAccount(file, password);
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }

  static batchRestore({ file, password }: RequestBatchRestore): void {
    try {
      keyring.restoreAccounts(file, password);
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }

  static jsonGetAccountInfo(json: KeyringPair$Json): ResponseJsonGetAccountInfo {
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

  static seedCreate({ length = SEED_DEFAULT_LENGTH, seed: _seed, type }: RequestSeedCreate): ResponseSeedCreate {
    const seed = _seed || mnemonicGenerate(length);

    return {
      address: keyring.createFromUri(getSuri(seed, type), {}, type).address,
      seed,
    };
  }

  static seedValidate({ suri, type }: RequestSeedValidate): ResponseSeedValidate {
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

  static async signingApprovePassword({ id, password, savePass }: RequestSigningApprovePassword): Promise<boolean> {
    const queued = await State.getSignRequest(id);
    const { cachedUnlocks } = await State.getFromStorage(['cachedUnlocks']);

    assert(queued, 'Unable to find request');

    const { reject, request, resolve } = queued;
    const pair = keyring.getPair(queued.account.address);

    if (!pair) {
      reject(new Error('Unable to find pair'));

      return false;
    }

    const { address } = pair;

    await Extension.refreshAccountPasswordCache(pair);

    // if the keyring pair is locked, the password is needed
    if (pair.isLocked && !password) reject(new Error('Password needed to unlock the account'));

    if (pair.isLocked) pair.decodePkcs8(password);

    const { payload } = request;

    if (isJsonPayload(payload)) {
      // Get the metadata for the genesisHash
      const currentMetadata = State.knownMetadata.find((meta: MetadataDef) => meta.genesisHash === payload.genesisHash);

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

  static async saveTimeoutCache(address: string): Promise<boolean> {
    const { cachedUnlocks } = await State.getFromStorage(['cachedUnlocks']);

    cachedUnlocks[address] = Date.now() + PASSWORD_EXPIRY_MS;

    await chrome.storage.local.set({ cachedUnlocks });

    return true;
  }

  static async signingApproveSignature({ id, signature }: RequestSigningApproveSignature): Promise<boolean> {
    State.signature = signature;
    const queued = await State.getSignRequest(id);

    assert(queued, 'Unable to find request');

    const { resolve } = queued;

    resolve({ id, signature });

    return true;
  }

  static async signingCancel({ id }: RequestSigningCancel): Promise<boolean> {
    const queued = await State.getSignRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    reject(new Error('Cancelled'));

    return true;
  }

  static async signingIsLocked({ id }: RequestSigningIsLocked): Promise<ResponseSigningIsLocked> {
    const queued = await State.getSignRequest(id);
    assert(queued, 'Unable to find request');
    const address = queued.request.payload.address;

    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    const remainingTime = await Extension.refreshAccountPasswordCache(pair);

    return {
      isLocked: pair.isLocked,
      remainingTime,
    };
  }

  // FIXME This looks very much like what we have in authorization
  static async signingSubscribe(id: string, port: chrome.runtime.Port): Promise<boolean> {
    const cb = await createSubscription<'pri(signing.requests)'>(id, port);
    // const { signSubject } = await State.getFromStorage(['signSubject']);

    const subscription = State.signSubject.subscribe((requests: SigningRequest[]): void => cb(requests));

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return true;
  }

  static windowOpen(path: AllowedPath): boolean {
    const url = `${chrome.runtime.getURL('popup.html')}#${path}`;

    if (!ALLOWED_PATH.includes(path)) {
      console.error('Not allowed to open the url:', url);

      return false;
    }

    withErrorLog(() => chrome.tabs.create({ url }));

    return true;
  }

  static derive(parentAddress: string, suri: string, password: string, metadata: KeyringPair$Meta): KeyringPair {
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

  static derivationValidate({ parentAddress, parentPassword, suri }: RequestDeriveValidate): ResponseDeriveValidate {
    const childPair = this.derive(parentAddress, suri, parentPassword, {});

    return {
      address: childPair.address,
      suri,
    };
  }

  static derivationCreate({
    genesisHash,
    name,
    parentAddress,
    parentPassword,
    password,
    suri,
  }: RequestDeriveCreate): boolean {
    const childPair = this.derive(parentAddress, suri, parentPassword, {
      genesisHash,
      name,
      parentAddress,
      suri,
    });

    keyring.addPair(childPair, password);

    return true;
  }

  static async removeAuthorization(url: string): Promise<ResponseAuthorizeList> {
    const list = await State.removeAuthorization(url);

    return { list };
  }

  static async deleteAuthRequest(requestId: string): Promise<void> {
    return State.deleteAuthRequest(requestId);
  }

  static updateCurrentTabs({ urls }: RequestActiveTabsUrlUpdate) {
    State.updateCurrentTabsUrl(urls);
  }

  static getConnectedTabsUrl() {
    return State.getConnectedTabsUrl();
  }

  static createAddress({ address, meta }: RequestAddressCreate) {
    keyring.saveAddress(address, meta, 'address');
  }

  static removeAddress(address: string) {
    keyring.forgetAddress(address);
  }

  static getAddresses() {
    return keyring.getAddresses();
  }

  static initAuth(): void {
    googleAuth.authExtension();
  }

  static async verifyToken({ token }: { token: string }): Promise<string> {
    return googleAuth.verifyToken(token);
  }

  static getToken(): void {
    chrome.identity.getAuthToken({}, function (token) {
      Extension.token = token;
    });
  }

  static async getFiles({ token }: { token: string }): Promise<IGetFilesResponse> {
    return googleAuth.getFiles(token);
  }

  static async getFile({ id }: GoogleFileId): Promise<IGDriveFile> {
    if (!Extension.token) await Extension.getToken();

    return googleAuth.getFile(id, Extension.token);
  }

  static createFile({ json, name }: Record<string, string>): void {
    if (!Extension.token) Extension.getToken();

    googleAuth.createFile({ json, name }, Extension.token);
  }

  static deleteFile({ id }: GoogleFileId): void {
    if (!Extension.token) Extension.getToken();

    googleAuth.deleteFile(id, Extension.token);
  }

  static async handle<TMessageType extends MessageTypes>(
    id: string,
    type: TMessageType,
    request: RequestTypes[TMessageType],
    port?: chrome.runtime.Port
  ): Promise<ResponseType<TMessageType>> {
    switch (type) {
      case 'pri(authorize.approve)':
        return Extension.authorizeApprove(request as RequestAuthorizeApprove);

      case 'pri(authorize.list)':
        return Extension.getAuthList();

      case 'pri(authorize.remove)':
        return Extension.removeAuthorization(request as string);

      case 'pri(authorize.delete.request)':
        return Extension.deleteAuthRequest(request as string);

      case 'pri(authorize.requests)':
        return port && (await Extension.authorizeSubscribe(id, port));

      case 'pri(addresses.create)':
        return Extension.createAddress(request as RequestAddressCreate);

      case 'pri(addresses.remove)':
        return Extension.removeAddress(request as string);

      case 'pri(addresses.get)':
        return Extension.getAddresses();

      case 'pri(authorize.update)':
        return Extension.authorizeUpdate(request as RequestUpdateAuthorizedAccounts);

      case 'pri(accounts.create.external)':
        return Extension.accountsCreateExternal(request as RequestAccountCreateExternal);

      case 'pri(accounts.create.hardware)':
        return Extension.accountsCreateHardware(request as RequestAccountCreateHardware);

      case 'pri(accounts.create.suri)':
        return Extension.accountsCreateSuri(request as RequestAccountCreateSuri);

      case 'pri(accounts.changePassword)':
        return Extension.accountsChangePassword(request as RequestAccountChangePassword);

      case 'pri(accounts.edit)':
        return Extension.accountsEdit(request as RequestAccountEdit);

      case 'pri(accounts.export)':
        return Extension.accountsExport(request as RequestAccountExport);

      case 'pri(accounts.batchExport)':
        return Extension.accountsBatchExport(request as RequestAccountBatchExport);

      case 'pri(accounts.forget)':
        return Extension.accountsForget(request as RequestAccountForget);

      case 'pri(accounts.show)':
        return Extension.accountsShow(request as RequestAccountShow);

      case 'pri(accounts.subscribe)':
        return port && Extension.accountsSubscribe(id, port);

      case 'pri(accounts.tie)':
        return Extension.accountsTie(request as RequestAccountTie);

      case 'pri(accounts.validate)':
        return Extension.accountsValidate(request as RequestAccountValidate);

      case 'pri(metadata.approve)':
        return Extension.metadataApprove(request as RequestMetadataApprove);

      case 'pri(metadata.get)':
        return Extension.metadataGet(request as string);

      case 'pri(metadata.list)':
        return Extension.metadataList();

      case 'pri(metadata.reject)':
        return Extension.metadataReject(request as RequestMetadataReject);

      case 'pri(metadata.requests)':
        return port && Extension.metadataSubscribe(id, port);

      case 'pri(activeTabsUrl.update)':
        return Extension.updateCurrentTabs(request as RequestActiveTabsUrlUpdate);

      case 'pri(connectedTabsUrl.get)':
        return Extension.getConnectedTabsUrl();

      case 'pri(derivation.create)':
        return Extension.derivationCreate(request as RequestDeriveCreate);

      case 'pri(derivation.validate)':
        return Extension.derivationValidate(request as RequestDeriveValidate);

      case 'pri(json.restore)':
        return Extension.jsonRestore(request as RequestJsonRestore);

      case 'pri(json.batchRestore)':
        return Extension.batchRestore(request as RequestBatchRestore);

      case 'pri(json.account.info)':
        return Extension.jsonGetAccountInfo(request as KeyringPair$Json);

      case 'pri(seed.create)':
        return Extension.seedCreate(request as RequestSeedCreate);

      case 'pri(seed.validate)':
        return Extension.seedValidate(request as RequestSeedValidate);

      case 'pri(settings.notification)':
        return State.setNotification(request as string);

      case 'pri(signing.approve.password)':
        return Extension.signingApprovePassword(request as RequestSigningApprovePassword);

      case 'pri(signing.approve.signature)':
        return Extension.signingApproveSignature(request as RequestSigningApproveSignature);

      case 'pri(signing.cancel)':
        return Extension.signingCancel(request as RequestSigningCancel);

      case 'pri(signing.isLocked)':
        return await Extension.signingIsLocked(request as RequestSigningIsLocked);

      case 'pri(signing.requests)':
        return port && Extension.signingSubscribe(id, port);

      case 'pri(window.open)':
        return Extension.windowOpen(request as AllowedPath);

      case 'pri(signing.refreshPasswordTimeout)':
        return await Extension.refreshAccountPasswordCache(request as string);

      case 'pri(signing.resetTimeouts)':
        return await Extension.resetTimeouts();

      case 'pri(signing.saveTimeoutCache)':
        return await Extension.saveTimeoutCache(request as string);

      case 'pri(google.get.files)':
        return Extension.getFiles(request as { token: string });

      case 'pri(google.auth)':
        return Extension.initAuth();

      case 'pri(google.verify.token)':
        return Extension.verifyToken(request as { token: string });

      case 'pri(google.get.file)':
        return Extension.getFile(request as GoogleFileId);

      case 'pri(google.create.file)':
        return Extension.createFile(request as Record<string, string>);

      case 'pri(google.delete.file)':
        return Extension.deleteFile(request as GoogleFileId);

      default:
        throw new Error(`Unable to handle message of type ${type}`);
    }
  }
}
