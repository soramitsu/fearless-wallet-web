// Copyright 2019-2022 @polkadot/extension-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { metadataExpand } from '@polkadot/extension-chains';
import { selectableNetworks } from '@polkadot/networks';

import { getId } from './background/extension-base/src/utils';
import { PORT_EXTENSION } from './background/extension-base/src/defaults';
import { CurrentAccountInfo } from './background/extension-base/src/stores/CurrentAccountStore';
import { NetworkJson } from './background/extension-base/src/api/evm/types/ether';
import type { MetadataDef, MetadataDefBase } from '@polkadot/extension-inject/types';
import type { KeyringPair$Meta, KeyringPair$Json } from '@polkadot/keyring/types';
import type {
  AccountJson,
  AllowedPath,
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  MessageTypes,
  MessageTypesWithNoSubscriptions,
  MessageTypesWithNullRequest,
  MessageTypesWithSubscriptions,
  MetadataRequest,
  RequestTypes,
  ResponseAuthorizeList,
  ResponseDeriveValidate,
  ResponseJsonGetAccountInfo,
  ResponseSigningIsLocked,
  ResponseTypes,
  SeedLengths,
  SigningRequest,
  SubscriptionMessageTypes,
  Port,
  BalanceJson,
  PriceJson,
  RequestSubscribePrice,
  BasicTxResponse,
  RequestTransfer,
  RequestCheckTransfer,
  ResponseCheckTransfer,
  ValidateJsonResult,
  RequestAccountMeta,
  ResponseAccountMeta,
  RequestCurrentAccountAddress,
  DisableNetworkResponse,
  ValidateNetworkResponse,
  ResponseCreateAccountSuri,
  RequestCheckSwap,
  ResponseCheckSwap,
  RequestSwap,
} from '@/extension/background/extension-base/src/background/types/types';
import type { Message, NetworkJsonOld, TransactionHistoryItemType } from '@extension-base/types';
import type { Chain } from '@polkadot/extension-chains/types';
import type { KeyringAddress, KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { HexString } from '@polkadot/util/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type {
  DerivationPath,
  FilesResponse,
  GoogleAuthTypes,
  ICreateFile,
  IGetFilesResponse,
  VerifyTokenResponse,
} from '@/interfaces';

const metadataGets = new Map<string, Promise<MetadataDef | null>>();

function getSavedMeta(genesisHash: string): Promise<MetadataDef | null> | undefined {
  return metadataGets.get(genesisHash);
}

function setSavedMeta(genesisHash: string, def: Promise<MetadataDef | null>): Map<string, Promise<MetadataDef | null>> {
  return metadataGets.set(genesisHash, def);
}

export const allChains: MetadataDefBase[] = selectableNetworks
  .filter(({ genesisHash }) => !!genesisHash.length)
  .map((network) => ({
    chain: network.displayName,
    genesisHash: network.genesisHash[0],
    icon: network.icon,
    ss58Format: network.prefix,
  }));

interface Handler {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  subscriber?: (data: any) => void;
}

type Handlers = Record<string, Handler>;

let port: Port | undefined;
const handlers: Handlers = {};

function connect() {
  port = chrome.runtime?.connect({ name: PORT_EXTENSION });
  port?.onDisconnect.addListener(connect);

  port?.onMessage.addListener((data: Message['data']): void => {
    const handler = handlers[data.id];

    if (!handler) {
      console.error(`Unknown response: ${JSON.stringify(data)}`);

      return;
    }

    if (!handler.subscriber) {
      delete handlers[data.id];
    }

    if (data.subscription) {
      // eslint-disable-next-line @typescript-eslint/ban-types
      (handler.subscriber as Function)(data.subscription);
    } else if (data.error) {
      handler.reject(new Error(data.error));
    } else {
      handler.resolve(data.response);
    }
  });
}

connect();

// setup a listener for messages, any incoming resolves the promise

function sendMessage<TMessageType extends MessageTypesWithNullRequest>(
  message: TMessageType
): Promise<ResponseTypes[TMessageType]>;
function sendMessage<TMessageType extends MessageTypesWithNoSubscriptions>(
  message: TMessageType,
  request: RequestTypes[TMessageType]
): Promise<ResponseTypes[TMessageType]>;
function sendMessage<TMessageType extends MessageTypesWithSubscriptions>(
  message: TMessageType,
  request: RequestTypes[TMessageType],
  subscriber: (data: SubscriptionMessageTypes[TMessageType]) => void
): Promise<ResponseTypes[TMessageType]>;
function sendMessage<TMessageType extends MessageTypes>(
  message: TMessageType,
  request?: RequestTypes[TMessageType],
  subscriber?: (data: unknown) => void
): Promise<ResponseTypes[TMessageType]> {
  return new Promise((resolve, reject): void => {
    const id = getId();

    handlers[id] = { reject, resolve, subscriber };
    port?.postMessage({ id, message, request: request || {} });
  });
}

export async function showAccount(address: string, isShowing: boolean): Promise<boolean> {
  return sendMessage('pri(accounts.show)', { address, isShowing });
}

export async function tieAccount(address: string, genesisHash: string | null): Promise<boolean> {
  return sendMessage('pri(accounts.tie)', { address, genesisHash });
}

export async function exportAccount(address: string, password: string): Promise<{ exportedJson: KeyringPair$Json }> {
  return sendMessage('pri(accounts.export)', { address, password });
}

export async function exportAccounts(
  addresses: string[],
  password: string
): Promise<{ exportedJson: KeyringPairs$Json }> {
  return sendMessage('pri(accounts.batchExport)', { addresses, password });
}

export async function validateAccount(address: string, password: string): Promise<boolean> {
  return sendMessage('pri(accounts.validate)', { address, password });
}

export async function forgetAccount(address: string, type: 'native' | 'mobile'): Promise<boolean> {
  return sendMessage('pri(accounts.forget)', { address, type });
}

export async function approveAuthRequest(id: string, authorizedAccounts: string[]) {
  return sendMessage('pri(authorize.approve)', { id, authorizedAccounts });
}

export async function approveMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.approve)', { id });
}

export async function cancelSignRequest(id: string): Promise<boolean> {
  return sendMessage('pri(signing.cancel)', { id });
}

export async function isSignLocked(address: string): Promise<ResponseSigningIsLocked> {
  return sendMessage('pri(signing.isLocked)', { address });
}

export async function approveSignPassword(id: string, savePass: boolean, password?: string): Promise<boolean> {
  return sendMessage('pri(signing.approve.password)', { id, password, savePass });
}

export async function approveSignSignature(id: string, signature: HexString): Promise<boolean> {
  return sendMessage('pri(signing.approve.signature)', { id, signature });
}

export async function createAccountExternal(name: string, address: string, genesisHash: string): Promise<boolean> {
  return sendMessage('pri(accounts.create.external)', { address, genesisHash, name });
}

export async function refreshPasswordTimeout(address: string): Promise<number> {
  return sendMessage('pri(signing.refreshPasswordTimeout)', address);
}

export async function resetTimeouts(): Promise<boolean> {
  return sendMessage('pri(signing.resetTimeouts)');
}

export async function saveTimeoutCache(address: string, isSavePass: boolean): Promise<boolean> {
  return sendMessage('pri(signing.saveTimeoutCache)', { address, isSavePass });
}

export async function createAccountHardware(
  address: string,
  hardwareType: string,
  accountIndex: number,
  addressOffset: number,
  name: string,
  genesisHash: string
): Promise<boolean> {
  return sendMessage('pri(accounts.create.hardware)', {
    accountIndex,
    address,
    addressOffset,
    genesisHash,
    hardwareType,
    name,
  });
}

export async function createAccountSuri(
  password: string,
  suri: string,
  type?: KeypairType,
  genesisHash?: string,
  meta?: Record<string, unknown>
): Promise<ResponseCreateAccountSuri> {
  return sendMessage('pri(accounts.create.suri)', { genesisHash, password, suri, type, meta });
}

export async function createAddress(address: string, meta: KeyringPair$Meta): Promise<boolean> {
  return sendMessage('pri(addresses.create)', { meta, address });
}

export async function removeAddress(address: string): Promise<boolean> {
  return sendMessage('pri(addresses.remove)', { address });
}

export async function getAddresses(): Promise<KeyringAddress[]> {
  return sendMessage('pri(addresses.get)');
}

export async function createSeed(
  length?: SeedLengths,
  seed?: string,
  type?: KeypairType
): Promise<{ address: string; seed: string }> {
  return sendMessage('pri(seed.create)', { length, seed, type });
}

export async function getAllMetatdata(): Promise<MetadataDef[]> {
  return sendMessage('pri(metadata.list)');
}

export async function getMetadata(genesisHash?: string | null, isPartial = false): Promise<Chain | null> {
  if (!genesisHash) return null;

  let request = getSavedMeta(genesisHash);

  if (!request) {
    request = sendMessage('pri(metadata.get)', genesisHash || null);
    setSavedMeta(genesisHash, request);
  }

  const def = await request;

  if (def) {
    return metadataExpand(def, isPartial);
  } else if (isPartial) {
    const chain = allChains.find((chain) => chain.genesisHash === genesisHash);

    if (chain) {
      return metadataExpand(
        {
          ...chain,
          specVersion: 0,
          tokenDecimals: 15,
          tokenSymbol: 'Unit',
          types: {},
        },
        isPartial
      );
    }
  }

  return null;
}

export async function rejectMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.reject)', { id });
}

export async function subscribeAccounts(cb: (accounts: AccountJson[]) => void): Promise<boolean> {
  return sendMessage('pri(accounts.subscribe)', null, cb);
}

export async function saveCurrentAccountAddress(
  data: RequestCurrentAccountAddress,
  callback: (data: CurrentAccountInfo) => void
): Promise<boolean> {
  return sendMessage('pri(accounts.current.saveAddress)', data, callback);
}

export async function updateCurrentAccountAddress(address: string): Promise<boolean> {
  return sendMessage('pri(accounts.update.current)', address);
}

export async function subscribeAuthorizeRequests(cb: (accounts: AuthorizeRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(authorize.requests)', null, cb);
}

export async function getAuthList(): Promise<ResponseAuthorizeList> {
  return sendMessage('pri(authorize.list)');
}

export async function getAccountMeta(request: RequestAccountMeta): Promise<ResponseAccountMeta> {
  return sendMessage('pri(accounts.get.meta)', request);
}

export async function removeAuthorization(url: string): Promise<ResponseAuthorizeList> {
  return sendMessage('pri(authorize.remove)', url);
}

export async function updateAuthorization(authorizedAccounts: string[], url: string): Promise<void> {
  return sendMessage('pri(authorize.update)', { authorizedAccounts, url });
}

export async function deleteAuthRequest(requestId: string): Promise<void> {
  return sendMessage('pri(authorize.delete.request)', requestId);
}

export async function cancelAuthRequest(requestId: string): Promise<boolean> {
  return sendMessage('pri(authorize.cancel)', requestId);
}

export async function subscribeMetadataRequests(cb: (accounts: MetadataRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(metadata.requests)', null, cb);
}

export async function subscribeSigningRequests(cb: (accounts: SigningRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(signing.requests)', null, cb);
}

export async function validateSeed(suri: string, type?: KeypairType): Promise<{ address: string; suri: string }> {
  return sendMessage('pri(seed.validate)', { suri, type });
}

export async function validateDerivationPath(
  parentAddress: string,
  suri: string,
  parentPassword: string
): Promise<ResponseDeriveValidate> {
  return sendMessage('pri(derivation.validate)', { parentAddress, parentPassword, suri });
}

export async function deriveAccount(
  parentAddress: string,
  suri: string,
  parentPassword: string,
  name: string,
  password: string,
  genesisHash: string | null
): Promise<boolean> {
  return sendMessage('pri(derivation.create)', { genesisHash, name, parentAddress, parentPassword, password, suri });
}

export async function isDerivationPathValid(request: DerivationPath): Promise<boolean> {
  return sendMessage('pri(accounts.validate.path)', request);
}

export async function windowOpen(path: AllowedPath): Promise<boolean> {
  return sendMessage('pri(window.open)', path);
}

export async function jsonGetAccountInfo(json: KeyringPair$Json): Promise<ResponseJsonGetAccountInfo> {
  return sendMessage('pri(json.account.info)', json);
}

export async function jsonRestore(file: KeyringPair$Json, password: string): Promise<string> {
  return sendMessage('pri(json.restore)', { file, password });
}

export async function isJsonValid(
  file: KeyringPair$Json,
  password: string,
  isSubstrate = true
): Promise<ValidateJsonResult> {
  return sendMessage('pri(json.valid)', { file, password, isSubstrate });
}

export async function batchRestore(file: KeyringPairs$Json, password: string): Promise<void> {
  return sendMessage('pri(json.batchRestore)', { file, password });
}

export async function setNotification(notification: string): Promise<boolean> {
  return sendMessage('pri(settings.notification)', notification);
}

export async function verifyToken(token: string): Promise<VerifyTokenResponse> {
  return sendMessage('pri(google.verify.token)', { token });
}

export async function initGoogleAuth(type: GoogleAuthTypes['type'] = 'main', wallet?: string): Promise<void> {
  return sendMessage('pri(google.auth)', { type, wallet });
}

export async function getGoogleFiles(token: string): Promise<IGetFilesResponse> {
  return sendMessage('pri(google.get.files)', { token });
}

export async function getGoogleFile(id: string, token: string): Promise<KeyringPair$Json> {
  return sendMessage('pri(google.get.file)', { id, token });
}

export async function createGoogleFile({ json, options, token }: ICreateFile): Promise<FilesResponse> {
  return sendMessage('pri(google.create.file)', { json, options, token });
}

export async function deleteGoogleFile(id: string, token: string): Promise<void> {
  return sendMessage('pri(google.delete.file)', { id, token });
}

export function isTabAuthorize(): Promise<ActiveTabAuthorizeStatus> {
  return sendMessage('pri(tab.status)');
}

export async function getBalance(): Promise<BalanceJson> {
  return sendMessage('pri(balance.get.balance)');
}

export async function subscribeBalance(callback: (balanceData: BalanceJson) => void): Promise<BalanceJson> {
  return sendMessage('pri(balance.get.subscription)', null, callback);
}

export async function subscribeHistory(
  callback: (historyMap: Record<string, TransactionHistoryItemType[]>) => void
): Promise<Record<string, TransactionHistoryItemType[]>> {
  return sendMessage('pri(transaction.history.get.subscription)', null, callback);
}

export async function getHistory(address: string, networkKey: string, token?: string) {
  return sendMessage('pri(transaction.history.get)', { address, networkKey, token });
}

export async function updateTransactionHistory(
  address: string,
  networkKey: string,
  item: TransactionHistoryItemType,
  callback: (items: TransactionHistoryItemType[]) => void
): Promise<boolean> {
  return sendMessage('pri(transaction.history.add)', { address, networkKey, item }, callback);
}

export async function getPrice(): Promise<PriceJson> {
  return sendMessage('pri(price.get.price)', null);
}

export async function subscribePrice(
  callback: (priceData: PriceJson) => void,
  request: RequestSubscribePrice = null
): Promise<PriceJson> {
  return sendMessage('pri(price.get.subscription)', request, callback);
}

export async function makeTransfer(
  request: RequestTransfer,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(accounts.transfer)', request, callback);
}

export async function checkTransfer(request: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
  return sendMessage('pri(accounts.checkTransfer)', request);
}

export async function makeSwap(
  request: RequestSwap,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(accounts.swap)', request, callback);
}

export async function checkSwap(request: RequestCheckSwap): Promise<ResponseCheckSwap> {
  return sendMessage('pri(accounts.checkSwap)', request);
}

export async function subscribeNetworkMap(
  callback: (data: Record<string, NetworkJsonOld>) => void
): Promise<Record<string, NetworkJsonOld>> {
  return sendMessage('pri(networkMap.getSubscription)', null, callback);
}

export async function upsertNetworkMap(data: NetworkJsonOld): Promise<boolean> {
  return sendMessage('pri(networkMap.upsert)', data);
}

export async function getNetworkMap(): Promise<Record<string, NetworkJsonOld>> {
  return sendMessage('pri(networkMap.getNetworkMap)');
}

export async function removeNetworkMap(networkKey: string): Promise<boolean> {
  return sendMessage('pri(networkMap.removeOne)', networkKey);
}

export async function disableNetworkMap(networkKey: string): Promise<DisableNetworkResponse> {
  return sendMessage('pri(networkMap.disableOne)', networkKey);
}

export async function enableNetworkMap(networkKey: string): Promise<boolean> {
  return sendMessage('pri(networkMap.enableOne)', networkKey);
}

export async function enableNetworks(targetKeys: string[]): Promise<boolean> {
  return sendMessage('pri(networkMap.enableMany)', targetKeys);
}

export async function disableNetworks(targetKeys: string[]): Promise<boolean> {
  return sendMessage('pri(networkMap.disableMany)', targetKeys);
}

export async function validateNetwork(
  provider: string,
  isEthereum: boolean,
  existedNetwork?: NetworkJson
): Promise<ValidateNetworkResponse> {
  return sendMessage('pri(apiMap.validate)', { provider, isEthereum, existedNetwork });
}

export async function disableAllNetwork(): Promise<boolean> {
  return sendMessage('pri(networkMap.disableAll)', null);
}

export async function enableAllNetwork(): Promise<boolean> {
  return sendMessage('pri(networkMap.enableAll)', null);
}

export async function resetDefaultNetwork(): Promise<boolean> {
  return sendMessage('pri(networkMap.resetDefault)', null);
}

export async function pingServiceWorker(): Promise<boolean> {
  return sendMessage('pri(app.port.ping)');
}
