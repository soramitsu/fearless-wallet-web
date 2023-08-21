import { metadataExpand } from '@polkadot/extension-chains';
import { selectableNetworks } from '@polkadot/networks';
import { getId } from '@extension-base/utils/utils';
import { PORT_EXTENSION } from '@extension-base/defaults';
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
  RequestCrossChain,
  RequestCheckTransfer,
  RequestCheckCrossChain,
  ResponseCheckTransfer,
  ResponseCheckCrossChain,
  ValidateJsonResult,
  RequestAccountMeta,
  ResponseAccountMeta,
  ValidateNetworkResponse,
  RequestCheckSwap,
  ResponseCheckSwap,
  RequestSwap,
  ResponseMakeSwap,
  ResponseTotalBalances,
  MobileSigningRequest,
} from '@extension-base/background/types/types';
import type { Message, NetworkJson, TransactionHistoryItemType } from '@extension-base/types';
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
  OnboardingStories,
  SoraFees,
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

export function showAccount(address: string, isShowing: boolean): Promise<boolean> {
  return sendMessage('pri(accounts.show)', { address, isShowing });
}

export function tieAccount(address: string, genesisHash: HexString | null): Promise<boolean> {
  return sendMessage('pri(accounts.tie)', { address, genesisHash });
}

export function accountUpdateName(address: string, name: string): Promise<boolean> {
  return sendMessage('pri(accounts.name)', { address, name });
}

export function exportAccount(address: string, password: string): Promise<{ exportedJson: KeyringPair$Json }> {
  return sendMessage('pri(accounts.export)', { address, password });
}

export function exportAccounts(addresses: string[], password: string): Promise<{ exportedJson: KeyringPairs$Json }> {
  return sendMessage('pri(accounts.batchExport)', { addresses, password });
}

export function validatePassword(address: string, password: string): Promise<boolean> {
  return sendMessage('pri(accounts.validate)', { address, password });
}

export function forgetAccount(address: string, type: 'native' | 'mobile'): Promise<boolean> {
  return sendMessage('pri(accounts.forget)', { address, type });
}

export function approveAuthRequest(id: string, authorizedAccounts: string[]) {
  return sendMessage('pri(authorize.approve)', { id, authorizedAccounts });
}

export function approvePolkaswapAuthRequest(authorizedAccounts: string[]) {
  return sendMessage('pri(authorize.approve.polkaswap)', authorizedAccounts);
}

export function approveMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.approve)', { id });
}

export function cancelSignRequest(id: string): Promise<boolean> {
  return sendMessage('pri(signing.cancel)', { id });
}

export function cancelMobileSignRequest(id: string): Promise<boolean> {
  return sendMessage('pri(mobileSigning.cancel)', { id });
}

export function isSignLocked(address: string): Promise<ResponseSigningIsLocked> {
  return sendMessage('pri(signing.isLocked)', { address });
}

export function approveSignPassword(id: string, savePass: boolean, password?: string): Promise<boolean> {
  return sendMessage('pri(signing.approve.password)', { id, password, savePass });
}

export function approveSignSignature(id: string, signature: HexString): Promise<boolean> {
  return sendMessage('pri(signing.approve.signature)', { id, signature });
}

export function approveSignMobileSignature(id: string, signature: HexString): Promise<boolean> {
  return sendMessage('pri(mobileSigning.approve.signature)', { id, signature });
}

export function createAccountExternal(name: string, address: string, genesisHash: HexString): Promise<boolean> {
  return sendMessage('pri(accounts.create.external)', { address, genesisHash, name });
}

export function refreshPasswordTimeout(address: string): Promise<number> {
  return sendMessage('pri(signing.refreshPasswordTimeout)', address);
}

export function saveTimeoutCache(address: string, isSavePass: boolean): Promise<boolean> {
  return sendMessage('pri(signing.saveTimeoutCache)', { address, isSavePass });
}

export function createAccountSuri(
  password: string,
  suri: string,
  type?: KeypairType,
  meta?: Record<string, unknown>
): Promise<string> {
  return sendMessage('pri(accounts.create.suri)', { password, suri, type, meta });
}

export function createMobileWallet(address: string, meta: KeyringPair$Meta): Promise<boolean> {
  return sendMessage('pri(accounts.create.mobile)', { meta, address });
}

export function removeAddress(address: string): Promise<boolean> {
  return sendMessage('pri(addresses.remove)', { address });
}

export function getAddresses(): Promise<KeyringAddress[]> {
  return sendMessage('pri(addresses.get)');
}

export function createSeed(
  length?: SeedLengths,
  seed?: string,
  type?: KeypairType
): Promise<{ address: string; seed: string }> {
  return sendMessage('pri(seed.create)', { length, seed, type });
}

export function getAllMetatdata(): Promise<MetadataDef[]> {
  return sendMessage('pri(metadata.list)');
}

export function updatePairMeta(address: string, meta: KeyringPair$Meta): Promise<boolean> {
  return sendMessage('pri(accounts.update.meta)', { address, meta });
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

export function rejectMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.reject)', { id });
}

export function subscribeAccounts(cb: (accounts: AccountJson[]) => void): Promise<AccountJson[]> {
  return sendMessage('pri(accounts.subscribe)', null, cb);
}

export function subscribeAddresses(cb: (accounts: AccountJson[]) => void): Promise<AccountJson[]> {
  return sendMessage('pri(addresses.subscribe)', null, cb);
}

export function triggerAccountsSubscription(): Promise<boolean> {
  return sendMessage('pri(accounts.triggerSubscription)');
}

export function updateCurrentAccountNetwork(address: string): Promise<boolean> {
  return sendMessage('pri(accounts.update.currentNetwork)', address);
}

export function updateCurrentAccountAddress(address: string): Promise<boolean> {
  return sendMessage('pri(accounts.update.current)', address);
}

export function subscribeAuthorizeRequests(cb: (requests: AuthorizeRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(authorize.requests)', null, cb);
}

export async function subscribeSoraCardToken(cb: (token: string) => void): Promise<boolean> {
  return sendMessage('pri(soraCard.token)', null, cb);
}

export function getAuthList(): Promise<ResponseAuthorizeList> {
  return sendMessage('pri(authorize.list)');
}

export function getAccountMeta(request: RequestAccountMeta): Promise<ResponseAccountMeta> {
  return sendMessage('pri(accounts.get.meta)', request);
}

export function removeAuthorization(url: string): Promise<ResponseAuthorizeList> {
  return sendMessage('pri(authorize.remove)', url);
}

export function updateAuthorization(authorizedAccounts: string[], url: string): Promise<void> {
  return sendMessage('pri(authorize.update)', { authorizedAccounts, url });
}

export function deleteAuthRequest(requestId: string): Promise<void> {
  return sendMessage('pri(authorize.delete.request)', requestId);
}

export function cancelAuthRequest(requestId: string): Promise<boolean> {
  return sendMessage('pri(authorize.cancel)', requestId);
}

export function subscribeMetadataRequests(cb: (accounts: MetadataRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(metadata.requests)', null, cb);
}

export function subscribeSigningRequests(cb: (accounts: SigningRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(signing.requests)', null, cb);
}

export function subscribeMobileSigningRequests(cb: (req: MobileSigningRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(mobileSigning.tx)', null, cb);
}

export function validateSeed(suri: string, type?: KeypairType): Promise<{ address: string; suri: string }> {
  return sendMessage('pri(seed.validate)', { suri, type });
}

export function validateDerivationPath(
  parentAddress: string,
  suri: string,
  parentPassword: string
): Promise<ResponseDeriveValidate> {
  return sendMessage('pri(derivation.validate)', { parentAddress, parentPassword, suri });
}

export function deriveAccount(
  parentAddress: string,
  suri: string,
  parentPassword: string,
  name: string,
  password: string,
  genesisHash: HexString | null
): Promise<boolean> {
  return sendMessage('pri(derivation.create)', { genesisHash, name, parentAddress, parentPassword, password, suri });
}

export function isDerivationPathValid(request: DerivationPath): Promise<boolean> {
  return sendMessage('pri(accounts.validate.path)', request);
}

export function windowOpen(path: AllowedPath): Promise<boolean> {
  return sendMessage('pri(window.open)', path);
}

export function jsonGetAccountInfo(json: KeyringPair$Json): Promise<ResponseJsonGetAccountInfo> {
  return sendMessage('pri(json.account.info)', json);
}

export function jsonRestore(file: KeyringPair$Json, password: string): Promise<string> {
  return sendMessage('pri(json.restore)', { file, password });
}

export function isJsonValid(file: KeyringPair$Json, password: string, isSubstrate = true): Promise<ValidateJsonResult> {
  return sendMessage('pri(json.valid)', { file, password, isSubstrate });
}

export function batchRestore(file: KeyringPairs$Json, password: string): Promise<void> {
  return sendMessage('pri(json.batchRestore)', { file, password });
}

export function verifyToken(token: string): Promise<VerifyTokenResponse | null> {
  return sendMessage('pri(google.verify.token)', { token });
}

export function initGoogleAuth(type: GoogleAuthTypes['type'] = 'main', wallet?: string): Promise<void> {
  return sendMessage('pri(google.auth)', { type, wallet });
}

export function getGoogleFiles(token: string): Promise<IGetFilesResponse> {
  return sendMessage('pri(google.get.files)', { token });
}

export function getGoogleFile(id: string, token: string): Promise<KeyringPair$Json> {
  return sendMessage('pri(google.get.file)', { id, token });
}

export function createGoogleFile({ json, options, token }: ICreateFile): Promise<FilesResponse> {
  return sendMessage('pri(google.create.file)', { json, options, token });
}

export function deleteGoogleFile(id: string, token: string): Promise<void> {
  return sendMessage('pri(google.delete.file)', { id, token });
}

export function isTabAuthorize(): Promise<ActiveTabAuthorizeStatus> {
  return sendMessage('pri(tab.status)');
}

export function getTotalBalances(): Promise<ResponseTotalBalances[]> {
  return sendMessage('pri(accounts.get.totalBalances)', null);
}

export function getBalance(): Promise<BalanceJson> {
  return sendMessage('pri(balance.get.balance)');
}

export function subscribeBalance(callback: (balanceData: BalanceJson) => void): Promise<BalanceJson> {
  return sendMessage('pri(balance.get.subscription)', null, callback);
}

export function subscribeHistory(
  callback: (historyMap: Record<string, TransactionHistoryItemType[]>) => void
): Promise<Record<string, TransactionHistoryItemType[]>> {
  return sendMessage('pri(transaction.history.get.subscription)', null, callback);
}

export function updateTransactionHistory(
  address: string,
  networkKey: string,
  item: TransactionHistoryItemType,
  callback: (items: TransactionHistoryItemType[]) => void
): Promise<boolean> {
  return sendMessage('pri(transaction.history.add)', { address, networkKey, item }, callback);
}

export function updateFiatSymbol(symbol: string): Promise<void> {
  return sendMessage('pri(price.update.currency)', symbol);
}

export function getPrice(): Promise<PriceJson> {
  return sendMessage('pri(price.get.price)', null);
}

export function subscribePrice(
  callback: (priceData: PriceJson) => void,
  request: RequestSubscribePrice = null
): Promise<PriceJson> {
  return sendMessage('pri(price.get.subscription)', request, callback);
}

export function checkTransfer(request: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
  return sendMessage('pri(accounts.checkTransfer)', request);
}

export function makeTransfer(
  request: RequestTransfer,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(accounts.transfer)', request, callback);
}

export function checkCrossChain(request: RequestCheckCrossChain): Promise<ResponseCheckCrossChain> {
  return sendMessage('pri(accounts.checkCrossChain)', request);
}

export function makeCrossChain(
  request: RequestCrossChain,
  callback: (data: BasicTxResponse) => void
): Promise<BasicTxResponse> {
  return sendMessage('pri(accounts.crossChain)', request, callback);
}

export function getSoraFees(): Promise<SoraFees> {
  return sendMessage('pri(accounts.get.soraFees)', null);
}

export function makeSwap(request: RequestSwap): Promise<ResponseMakeSwap> {
  return sendMessage('pri(accounts.swap)', request);
}

export function checkSwap(request: RequestCheckSwap): Promise<ResponseCheckSwap> {
  return sendMessage('pri(accounts.checkSwap)', request);
}

export function subscribeNetworkMap(
  callback: (data: Record<string, NetworkJson>) => void
): Promise<Record<string, NetworkJson>> {
  return sendMessage('pri(networkMap.getSubscription)', null, callback);
}

export function upsertNetworkMap(data: NetworkJson): Promise<boolean> {
  return sendMessage('pri(networkMap.upsert)', data);
}

export function toggleNetworkType(type: string): Promise<void> {
  return sendMessage('pri(networkMap.setNetwork)', type);
}

export function toggleFavoriteNetwork(name: string): Promise<void> {
  return sendMessage('pri(networkMap.toggle.favorite)', name);
}

export function getNetworkMap(): Promise<Record<string, NetworkJson>> {
  return sendMessage('pri(networkMap.getNetworkMap)');
}

export function validateNetwork(
  provider: string,
  isEthereum: boolean,
  existedNetwork?: NetworkJson
): Promise<ValidateNetworkResponse> {
  return sendMessage('pri(apiMap.validate)', { provider, isEthereum, existedNetwork });
}

export function pingServiceWorker(): Promise<boolean> {
  return sendMessage('pri(app.port.ping)');
}

export function getOnboardingStories(lang: string): Promise<OnboardingStories> {
  return sendMessage('pri(onboarding.get.stories)', lang);
}

export function setOnboardingSeen(): Promise<void> {
  return sendMessage('pri(onboarding.seen)');
}

export function isOnboardingRequired(): Promise<boolean> {
  return sendMessage('pri(onboarding.isRequired)');
}
