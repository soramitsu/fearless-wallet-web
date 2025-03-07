import { api as apiSora } from '@sora-substrate/util';
import { chrome } from '@extension-base/utils/crossenv';
import { hexToU8a, isHex, assert } from '@polkadot/util';
import { isEthereumAddress, base64Decode } from '@polkadot/util-crypto';
import { createPair } from '@polkadot/keyring';
import { ethers, formatUnits, Wallet } from 'ethers';
import { getEVMTransactionObject, makeEVMTransfer } from '@extension-base/api/evm/transfer';
import { estimateFee, makeTransfer } from '@extension-base/api/substrate/transfer';
import { createSwap } from '@extension-base/api/substrate/sora';
import FWExtensionBase from '@extension-base/background/handlers/ExtensionBase';
import { makeCrossChain, estimateCrossChainFee } from '@extension-base/api/substrate/crossChain';
import { getInternalError } from '@walletconnect/utils';
import {
  isProposalExpired,
  isSupportWalletConnectNamespace,
  isSupportWalletConnectChain,
  convertHexToUtf8,
  getEip155MessageAddress,
} from '@extension-base/services/wallet-connect-service/utils';
import registry from '@extension-base/api/substrate/typeRegistry';
import { TransferErrorCode } from '@extension-base/background/types/types';
import {
  type RequestConnectWalletConnect,
  type WalletConnectSessionRequest,
  type RequestApproveConnectWalletSession,
  type ResultApproveWalletConnectSession,
  type RequestRejectConnectWalletSession,
  type RequestDisconnectWalletConnectSession,
  type WalletConnectTransactionRequest,
  type RequestApproveWalletConnect,
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
import { type MakeCrossChainProps } from '../../api/substrate/types';
import { EXTENSION_URL } from '../../const';
import { makeTonTransfer, MAX_TON_FEE } from '../../api/ton/transfer';
import type { MetadataDef } from '@polkadot/extension-inject/types';
import type { EvmRequests, EvmRequestsSubjectPayload } from '@extension-base/services/request-service/types';
import type {
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
  RequestGenerateMnemonic,
  RequestValidateMnemonic,
  RequestUpdateCurrentAccount,
  ResponseBalanceRequest,
  RequestGetHistory,
} from '@extension-base/background/types/types';
import type {
  PoolsParamsRequest,
  MakePoolsRequest,
  GetShareOfPoolRequest,
  DefaultParams as DefaultPoolParams,
} from '@extension-base/services/pools-service/types';
import type { SignerPayloadRaw, SignerPayloadJSON } from '@polkadot/types/types';
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
import type { NetworkJson } from '@extension-base/types';
import type State from '@extension-base/background/handlers/State';
import type { ProposalTypes, SessionTypes } from '@walletconnect/types';
import type { HexString } from '@polkadot/util/types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import type { DerivationPath, GoogleAuthTypes, ICreateFile, RequestGoogleToken } from '@/interfaces';
import { WalletEcosystem } from '@/interfaces';
import { stripUrl, withErrorLog } from '@/extension/background/extension-base/src/background/helpers';
import {
  isNativeEVMNetwork,
  uniqueStringArray,
  getBalanceItem,
} from '@/extension/background/extension-base/src/background/handlers/utils';
import { LIQUID_SOURCE_FOR_MARKET } from '@/consts/currencies';
import { ALL_NETWORKS, NATIVE_ETHEREUM_NETWORKS } from '@/consts/networks';
import { isSameString, isTonNetwork } from '@/helpers';

function isJsonPayload(value: SignerPayloadJSON | SignerPayloadRaw): value is SignerPayloadJSON {
  return (value as SignerPayloadJSON).genesisHash !== undefined;
}

export default class Extension extends FWExtensionBase {
  constructor(state: State) {
    super(state);
  }

  private cancelSubscription(id: string): boolean {
    return this.state.subscriptionService.cancelSubscription(id);
  }

  async accountsForget({ address, type }: RequestAccountForget): Promise<boolean> {
    const authorizedAccountsDiff: AuthorizedAccountsDiff = [];
    const pair = this.state.keyringService.getPair(address);
    const ethereumAddress = pair?.meta.ethereumAddress as string | undefined;

    // cycle through authUrls and prepare the array of diff
    this.state.requestService.getAuthorize((authUrls) => {
      Object.entries(authUrls).forEach(([url, urlInfo]) => {
        if (urlInfo.authorizedAccounts.includes(address))
          authorizedAccountsDiff.push([
            url,
            urlInfo.authorizedAccounts.filter((previousAddress) => previousAddress !== address),
            'substrate',
          ]);

        if (urlInfo.evmAuthorizedAccount === ethereumAddress) authorizedAccountsDiff.push([url, [''], 'evm']);
      });
    });

    this.state.requestService.updateAuthorizedAccounts(authorizedAccountsDiff);

    if (type === 'native') {
      this.state.walletConnectService.removeSessions(address, ethereumAddress);

      if (ethereumAddress) this.state.keyringService.forgetAccount(ethereumAddress);

      this.state.keyringService.forgetAccount(address);
    } else {
      const account = this.state.keyringService.getAddress(address);

      this.state.keyringService.forgetAddress(address);
      this.state.walletConnectDappService.disconnect(account?.meta.wcTopic as string);
    }

    const isWasCurrentAccount = address === this.state.currentAccount?.address;

    if (isWasCurrentAccount) {
      const allAccounts = this.state.keyringService.getAllMainAccounts();
      const firstAccount = allAccounts?.[0];

      if (allAccounts.length)
        this.state.updateCurrentAccount({
          address: firstAccount?.address ?? '',
          walletEcosystem: firstAccount.meta.walletEcosystem,
        });
    }

    this.state.cleanupDeletedAccount(address);

    return true;
  }

  async accountsCreate({ suri, type, meta, walletEcosystem }: RequestAccountCreateSuri): Promise<string> {
    const address = await this.state.keyringService.addAccount(
      suri,
      { ...meta, isMobile: false },
      walletEcosystem,
      type
    );

    if (!isEthereumAddress(address)) this.state.updateCurrentAccount({ address, walletEcosystem });

    return address;
  }

  accountsValidatePassword({ password }: RequestAccountValidate): boolean {
    return this.state.keyringService.getPassword() === password;
  }

  convertAccounts(accounts: SubjectInfo, walletEcosystem = WalletEcosystem.Substrate): AccountJson[] {
    return Object.values(accounts).flatMap<AccountJson>(({ json: { address, meta }, type }) => {
      if (isEthereumAddress(address)) return [];

      const pair = this.state.keyringService.getPair(address);
      const haveEntropy = pair?.haveEntropy;

      return {
        address,
        ethereumAddress: meta.ethereumAddress as string,
        active: address === this.state.currentAccount?.address,
        name: meta.name ?? '',
        type,
        haveEntropy,
        network: this.state.networkService.selectedNetworks[address] ?? ALL_NETWORKS,
        walletEcosystem,
        ...meta,
      };
    });
  }

  async accountsSubscribe(id: string, port?: Port): Promise<AccountJson[]> {
    const cb = this.state.subscriptionService.createSubscription<'pri(accounts.subscribe)'>(id, port);

    const substrateTransformedAddresses = this.convertAccounts(this.state.keyringService.addressSubject.value);
    const substrateTransformedAccounts = this.convertAccounts(this.state.keyringService.accountSubject.value);
    const tonTransformedAccounts = this.convertAccounts(this.state.keyringService.tonKeyring.accountSubject.value);

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

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => {
      substrateAddressesSubscription.unsubscribe();
      substrateAccountsSubscription.unsubscribe();
      tonSubscription.unsubscribe();
    });

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return [...substrateTransformedAddresses, ...substrateTransformedAccounts, ...tonTransformedAccounts];
  }

  authorizeApprove({ authorizedAccounts, id }: RequestAuthorizeApprove): boolean {
    const authRequest = this.state.requestService.getAuthRequest(id);

    assert(authRequest, 'Unable to find request');

    authRequest.resolve({ authorizedAccounts });

    return true;
  }

  async authorizeUpdate({ authorizedAccounts, url, authType }: RequestUpdateAuthorizedAccounts): Promise<void> {
    return this.state.requestService.updateAuthorizedAccounts([[url, authorizedAccounts, authType]]);
  }

  authList() {
    return new Promise<AuthUrls>((resolve) => {
      this.state.requestService.getAuthorize((authUrls: AuthUrls) => {
        const addressList = Object.keys(this.state.keyringService.getAllAccounts());
        const urlList = Object.keys(authUrls);

        if (Object.keys(authUrls[urlList[0]]?.allowedAccountsMap).toString() !== addressList.toString()) {
          urlList.forEach((url) => {
            const authUrl = authUrls[url];
            const keys = Object.keys(authUrl?.allowedAccountsMap);

            addressList.forEach((address) => {
              if (!keys.includes(address)) authUrl.allowedAccountsMap[address] = false;
            });

            keys.forEach((address) => {
              if (!addressList.includes(address)) delete authUrl?.allowedAccountsMap[address];
            });
          });

          this.state.requestService.setAuthorize(authUrls);
        }

        resolve(authUrls);
      });
    });
  }

  async getAuthList(): Promise<ResponseAuthorizeList> {
    const list = await this.authList();

    return { list };
  }

  async isTabAuthorize(): Promise<ActiveTabAuthorizeStatus> {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    if (!tab || !tab.url) {
      return {
        isAuthorize: false,
        authorizeAccountsCount: 0,
        dAppName: '',
      };
    }

    const tabHostName = new URL(tab.url).hostname;

    return new Promise((resolve) => {
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
  }

  authorizeSubscribe(id: string, port?: Port): AuthorizeRequest[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(authorize.requests)'>(id, port);

    const authSubscription = this.state.authSubject.subscribe((requests: AuthorizeRequest[]): void => cb(requests));

    this.state.subscriptionService.setUnsubscriptionHandle(id, authSubscription.unsubscribe);

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

    this.state.subscriptionService.setUnsubscriptionHandle(id, metaSubscription.unsubscribe);

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.metaSubject.value;
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
    const stringFile = JSON.stringify(file);

    if (ethers.isKeystoreJson(stringFile))
      return new Promise((resolve, reject) => {
        try {
          const { privateKey } = ethers.decryptKeystoreJsonSync(stringFile, password);

          const address = this.state.keyringService.addAccount(
            privateKey,
            { name: (file.meta?.name ?? '') as string, isMobile: false },
            WalletEcosystem.Substrate,
            'ethereum'
          );

          resolve(address);
        } catch (error) {
          reject({ error: (error as Error).message });
        }
      });

    const isPasswordValidated = this.validatePassword(file, password);

    if (isPasswordValidated)
      return new Promise((resolve, reject) => {
        try {
          const { address } = this.state.keyringService.restoreAccount(file, password);
          const isEthereum = isEthereumAddress(address);

          if (!isEthereum) {
            this.state.updateNetworkForNewWallet(address);
            this.state.updateCurrentAccount({ address });
          }

          resolve(address);
        } catch (error) {
          reject({ error: (error as Error).message });
        }
      });
    else throw new Error('Unable to decode using the supplied passphrase');
  }

  private async toggleNetworkFavorite(networkKey: string): Promise<void> {
    await this.state.setFavoriteNetwork(networkKey);
  }

  private async upsertNetworkMap(data: NetworkJson): Promise<void> {
    try {
      this.state.networkService.upsertNetworkMap(data);
      this.state.updateServiceInfo();
    } catch (e) {
      console.error(e);
    }
  }

  async signEvmApprove({ id }: RequestSigningApprove): Promise<boolean> {
    const request = this.state.requestService.getSignRequest(id) as EvmRequestsSubjectPayload | undefined;

    assert(request, 'Unable to find request');

    const { data } = request;

    const address = getEip155MessageAddress(request.method, data);

    const substrateAddress = this.state.keyringService.getSubstrateAddress(address);
    const ethereumAddress = this.state.keyringService.getEthereumAddress(substrateAddress);
    const isMobile = this.state.keyringService.isMobileAccount(substrateAddress);

    if (isMobile) {
      try {
        const account = this.state.keyringService.getAddress(substrateAddress);

        if (!account || account.meta.wcTopic) throw new Error('Couldnt find account');

        const res = await this.state.walletConnectDappService.onEvmRequest(
          id,
          request.url,
          request.method,
          request.data,
          account.meta.wcTopic as string
        );
        if (res) request.resolve(res);
      } catch {
        request.reject(new Error('USER_REJECTED'));

        return false;
      }

      return true;
    }

    const method = request.method;
    const { list: authList } = await this.getAuthList();
    const auth = authList[stripUrl(request.url)];

    const network = Object.values(this.state.networkService.networkMap).find(
      (el) =>
        isSameString(el.genesisHash, auth.currentEvmNetworkKey) || isSameString(el.name, auth.currentEvmNetworkKey)
    );

    if (!network) throw new Error(TransferErrorCode.UNSUPPORTED);

    const { privateKey } = this.state.keyringService.accountExportPrivateKey({ address: ethereumAddress });

    const signer = new Wallet(privateKey, this.state.getEvmApi(network.name)?.api);

    if (method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
      const txData = request.data[0] as { to: string; value: string };

      const { hash } = await signer.sendTransaction(txData);

      request.resolve({ id: request.id, payload: hash as HexString });
    } else {
      const params = request.data;

      if (
        [
          'eth_sign',
          'personal_sign',
          'eth_signTypedData',
          'eth_signTypedData_v1',
          'eth_signTypedData_v3',
          'eth_signTypedData_v4',
        ].indexOf(method) < 0
      )
        throw new Error('Not found sign method');

      let payload;

      if (typeof params[0] === 'string' && isEthereumAddress(params[0])) payload = params[1];
      else if (typeof params[1] === 'string' && isEthereumAddress(params[1])) payload = params[0];

      if (address === '' || !payload) throw new Error('Not found address or payload to sign');

      const message =
        ['eth_sign', 'personal_sign'].indexOf(method) > -1 ? convertHexToUtf8(payload) : JSON.parse(payload);

      if (!(['eth_sign', 'personal_sign'].indexOf(method) > -1)) delete message.types['EIP712Domain'];

      const signature = await (['eth_sign', 'personal_sign'].indexOf(method) > -1
        ? signer.signMessage(message)
        : signer.signTypedData(message.domain, message.types, message.message));

      request.resolve({ id: request.id, payload: signature as HexString });
    }

    return true;
  }

  async signingApprove({ id }: RequestSigningApprove): Promise<boolean> {
    const queued = this.state.requestService.getSignRequest(id);

    assert(queued, 'Unable to find request');

    if (queued && 'data' in queued) return this.signEvmApprove({ id }); // sign evm requests

    const account = this.state.keyringService
      .getAllAccounts()
      .find(({ address }) => isSameString(address, queued.account.address));

    const { reject, request, resolve } = queued;

    if (account && account?.meta.isMobile) {
      const res = await this.state.walletConnectDappService.onRequest(queued.request.payload as SignerPayloadJSON);

      resolve({ payload: res.signature, id });

      return true;
    }

    const pair = this.state.keyringService.getPair(queued.account.address);

    if (!pair) {
      reject(new Error('Unable to find pair'));

      return false;
    }

    // if the keyring pair is locked, the password is needed
    if (pair.isLocked) this.state.keyringService.unlockPair(pair);

    const { payload } = request;

    if (isJsonPayload(payload)) {
      // Get the metadata for the genesisHash
      const currentMetadata = this.state.requestService.knownMetadata.find(
        (meta: MetadataDef) => meta.genesisHash === payload.genesisHash
      );

      // set the registry before calling the sign function
      registry.setSignedExtensions(payload.signedExtensions, currentMetadata?.userExtensions);

      if (currentMetadata) registry.register(currentMetadata?.types);
    }

    const result = await request.sign(registry, pair);

    resolve({ id, payload: result.signature });

    return true;
  }

  signingApproveSignature({ id, signature }: RequestSigningApproveSignature): boolean {
    const queued = this.state.requestService.getSignRequest(id);

    assert(queued, 'Unable to find request');

    queued.resolve({ id, payload: signature });

    return true;
  }

  signingCancel({ id }: RequestSigningCancel): boolean {
    const queued = this.state.requestService.getSignRequest(id);

    assert(queued, 'Unable to find request');

    queued.reject(new Error('Cancelled'));

    return true;
  }

  signingSubscribe(id: string, port?: Port): SigningRequest[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(signing.requests)'>(id, port);

    const signSubscription = this.state.requestService.signSubject.subscribe((requests: SigningRequest[]): void =>
      cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, signSubscription.unsubscribe);

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.signSubject.value;
  }

  signingEvmSubscribe(id: string, port?: Port): EvmRequests {
    const cb = this.state.subscriptionService.createSubscription<'pri(signing.evmRequests)'>(id, port);

    const signEvmSubscription = this.state.requestService.signEvmSubject.subscribe((requests: EvmRequests): void =>
      cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, signEvmSubscription.unsubscribe);

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.signEvmSubject.value;
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
    const auths = await this.state.requestService.getAuthList();

    delete auths[url];

    this.state.requestService.setAuthorize(auths);

    return { list: auths };
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

    this.state.balanceService.evmBalanceService.fetchBalance({
      networks: NATIVE_ETHEREUM_NETWORKS,
      assetId,
      ethereumAddress,
    });
  }

  private subscribeBalance(id: string, port?: Port): Promise<BalanceJson> {
    const cb = this.state.subscriptionService.createSubscription<'pri(balance.subscription)'>(id, port);

    const balanceSubscription = this.state.balanceService.balanceSubject.subscribe({ next: (rs) => cb(rs) });

    this.state.subscriptionService.setUnsubscriptionHandle(id, balanceSubscription.unsubscribe);

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

    this.state.subscriptionService.setUnsubscriptionHandle(id, priceSubscription.unsubscribe);

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.getPrice();
  }

  public async soraFeesSubscribe(id: string, port?: Port) {
    const cb = this.state.subscriptionService.createSubscription<'pri(accounts.soraFees.subscribe)'>(id, port);

    const soraFeesSubscription = this.state.soraFees.subscribe({
      next: (rs) => cb(rs),
    });

    this.state.subscriptionService.setUnsubscriptionHandle(id, soraFeesSubscription.unsubscribe);

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
    const { swapOptions } = await createSwap(options, apiSora, this.state);
    const { isExchangeB, swapDexId, amountA, amountB, slippage, assetA, assetB, marketType } = swapOptions!;
    const errors: Array<BasicTxError> = [];
    const address = this.state.getAccountAddress();
    const liquiditySource = LIQUID_SOURCE_FOR_MARKET[marketType!];

    this.state.keyringService.unlockPair(address);

    apiSora.shouldPairBeLocked = false;

    try {
      await apiSora.swap.execute(assetA, assetB, amountA, amountB, slippage, isExchangeB, liquiditySource, swapDexId);
    } catch (ex) {
      errors.push({
        code: TransferErrorCode.SWAP_ERROR,
        message: '',
      });

      console.info(`Swap transaction failed ${ex}`);
    }

    return {
      status: true,
      errors,
    };
  }

  private async checkTransfer(request: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
    const { from, networkKey, to, assetId, relayChain, amount } = request;
    const substrateAddress = this.state.keyringService.getSubstrateAddress(from);

    const tokenBalance = this.state.balanceService.getTokenBalance(substrateAddress, assetId, relayChain);
    const balance = getBalanceItem(tokenBalance.balances, networkKey)!;

    let fee = '0';
    const errors: BasicTxError[] = [];

    // Estimate with EVM API
    if (isNativeEVMNetwork(networkKey)) {
      try {
        const { fee: feeValue } = await getEVMTransactionObject(
          {
            balance,
            networkKey,
            to,
            from,
            amount: balance?.transferable || '0',
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
      fee = MAX_TON_FEE;
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

    const substrateAddress = this.state.keyringService.getSubstrateAddress(from);
    const tokenBalance = this.state.balanceService.getTokenBalance(substrateAddress, assetId, relayChain);
    const balance = getBalanceItem(tokenBalance.balances, networkKey)!;

    const callback = this.state.subscriptionService.createSubscription<'pri(accounts.makeTransfer)'>(id, port);

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
      balance,
    };

    if (isNativeEVMNetwork(networkKey)) {
      const { privateKey } = this.state.keyringService.accountExportPrivateKey({ address: from });

      transferProm = makeEVMTransfer(
        {
          ...params,
          privateKey,
          networkKey,
        },
        this.state
      );
    } else if (isTonNetwork(networkKey)) {
      transferProm = makeTonTransfer(params, this.state);
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

      callback({
        status: false,
        errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: (ex as Error).message }],
      });

      setTimeout(() => this.cancelSubscription(id), 500);
    }

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return { status: true };
  }

  private async checkCrossChain(request: RequestCheckCrossChain): Promise<ResponseCheckCrossChain> {
    const { from, originNet, destinationNet, to, assetId, relayChain, amount } = request;

    if (destinationNet === '') return { estimateFee: '0', destEstimateFee: '0' };

    const substrateAddress = this.state.keyringService.getSubstrateAddress(from);
    const tokenBalance = this.state.balanceService.getTokenBalance(substrateAddress, assetId, relayChain);

    const [fee, crossChainFee] = await estimateCrossChainFee(
      {
        assetId,
        originNet,
        destinationNet,
        amount: amount!,
        from,
        to,
        tokenBalance,
      },
      this.state
    );

    return {
      estimateFee: fee.toString(),
      destEstimateFee: crossChainFee.toString(),
    };
  }

  private async makeCrossChain(id: string, request: RequestCrossChain, port?: Port): Promise<BasicTxResponse> {
    const { from, originNet, destinationNet, to, assetId, relayChain, isMobile, amount = '0' } = request;

    this.state.keyringService.unlockPair(from);

    const substrateAddress = this.state.keyringService.getSubstrateAddress(from);
    const tokenBalance = this.state.balanceService.getTokenBalance(substrateAddress, assetId, relayChain);

    const callback = this.state.subscriptionService.createSubscription<'pri(accounts.makeCrossChain)'>(id, port);

    const params: MakeCrossChainProps = {
      assetId,
      originNet,
      destinationNet,
      amount,
      from,
      to,
      tokenBalance,
      callback,
      isMobile: !!isMobile,
    };

    try {
      await makeCrossChain(params, this.state);

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

      callback({
        status: false,
        errors: [{ code: TransferErrorCode.CROSSCHAIN_ERROR, message: (ex as Error).message }],
      });

      setTimeout(() => this.cancelSubscription(id), 500);
    }

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return { status: true };
  }

  public checkScamAddress(request: RequestCheckScam) {
    return this.state.scamService.checkScamAddress(request);
  }

  private createMobileWallet({ address, meta }: RequestAddressCreate) {
    this.state.keyringService.saveAddress(address, meta, 'address');

    this.state.updateCurrentAccount({ address });
  }

  private subscribeNetworkMap(id: string, port?: Port): Record<string, NetworkJson> {
    const cb = this.state.subscriptionService.createSubscription<'pri(networkMap.getSubscription)'>(id, port);

    const networkMapSubscription = this.state.networkService.networkMapStore
      .getSubject()
      .subscribe({ next: (rs) => cb(rs) });

    this.state.subscriptionService.setUnsubscriptionHandle(id, networkMapSubscription.unsubscribe);

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

    this.state.subscriptionService.setUnsubscriptionHandle(id, selectedNetworksSubscription.unsubscribe);

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
    const { from } = request.params;

    this.state.keyringService.unlockPair(from);

    return await this.state.stakingService.makeStaking(request);
  }

  async makePool(request: MakePoolsRequest): Promise<BasicTxResponse> {
    const address = this.state.getAccountAddress();
    const substrateAddress = this.state.keyringService.getSubstrateAddress(address);

    this.state.keyringService.unlockPair(substrateAddress);

    const result = await this.state.poolsService.makePool(request);

    return result;
  }

  async getShareOfPool(params: GetShareOfPoolRequest): Promise<string> {
    return params.type === 'addLiquidity'
      ? await this.state.poolsService.getShareOfPoolByAddLiquidity(params)
      : this.state.poolsService.getShareOfPoolByRemoveLiquidity(params);
  }

  private async fetchBalance({
    address,
    networks,
    ethereumAddress,
    walletEcosystem,
  }: FetchBalanceRequest): Promise<ResponseBalanceRequest[]> {
    if (walletEcosystem === WalletEcosystem.Ton) {
      const tonNetworks = networks.filter(
        (network) => this.state.networkService.networkMap[network].ecosystem === 'ton'
      );

      return await this.state.balanceService.fetchBalance({
        address,
        tonNetworks,
        ethereumAddress: ethereumAddress ?? '',
        walletEcosystem,
      });
    }

    const evmNetworks = networks.filter(
      (network) => this.state.networkService.networkMap[network].ecosystem === 'ethereum'
    );

    const substrateNetworks = networks.filter((network) => {
      const ecosystem = this.state.networkService.networkMap[network].ecosystem;

      return ecosystem === 'substrate' || ecosystem === 'ethereumBased';
    });

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

    this.state.subscriptionService.setUnsubscriptionHandle(id, subscription.unsubscribe);

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

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

    this.state.subscriptionService.setUnsubscriptionHandle(id, subscription.unsubscribe);

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

    this.state.subscriptionService.setUnsubscriptionHandle(id, requestSubscription.unsubscribe);

    port?.onDisconnect.addListener(() => this.cancelSubscription(id));

    return this.state.requestService.signWcSubject.value;
  }

  async wcRequestApprove({ address, topic }: RequestApproveWalletConnect) {
    const substrateAddress = this.state.keyringService.getSubstrateAddress(address);
    const ethereumAddress = this.state.keyringService.getEthereumAddress(substrateAddress);

    const request = this.state.requestService.signWcRequest(topic);

    const method = request.request.params.request.method;
    const [, chainId] = request.request.params.chainId.split(':');
    const network = Object.values(this.state.networkService.networkMap).find((el) => el.chainId === chainId);

    if (!network) throw new Error(TransferErrorCode.UNSUPPORTED);

    const { privateKey } = this.state.keyringService.accountExportPrivateKey({ address: ethereumAddress });

    const signer = new Wallet(privateKey, this.state.getEvmApi(network.name)?.api);

    if (method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
      const txData = request.request.params.request.params[0] as { to: string; value: string };

      const { hash } = await signer.sendTransaction(txData);
      request.resolve({ id: request.request.topic, payload: hash as HexString });
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
      )
        throw new Error('Not found sign method');

      let payload;

      if (typeof params[0] === 'string' && isEthereumAddress(params[0])) payload = params[1];
      else if (typeof params[1] === 'string' && isEthereumAddress(params[1])) payload = params[0];

      if (address === '' || !payload) throw new Error('Not found address or payload to sign');

      const message =
        ['eth_sign', 'personal_sign'].indexOf(method) > -1 ? convertHexToUtf8(payload) : JSON.parse(payload);

      if (!(['eth_sign', 'personal_sign'].indexOf(method) > -1)) {
        delete message.types['EIP712Domain'];
      }

      const signature = await (['eth_sign', 'personal_sign'].indexOf(method) > -1
        ? signer.signMessage(message)
        : signer.signTypedData(message.domain, message.types, message.message));

      request.resolve({ id: request.request.topic, payload: signature as HexString });
    }

    this.state.keyringService.unlockPair(substrateAddress);
    this.state.keyringService.unlockPair(ethereumAddress);

    return true;
  }

  wcRequestReject({ topic }: RequestDisconnectWalletConnectSession) {
    const request = this.state.requestService.signWcRequest(topic);

    request?.reject(new Error('USER_REJECTED'));

    return true;
  }

  private WCNotSupportSubscribe(id: string, port?: chrome.runtime.Port): WalletConnectNotSupportRequest[] {
    const cb = this.state.subscriptionService.createSubscription<'pri(walletConnect.requests.notSupport.subscribe)'>(
      id,
      port
    );

    const subscription = this.state.requestService.notSupportWCSubject.subscribe(
      (requests: WalletConnectNotSupportRequest[]): void => cb(requests)
    );

    this.state.subscriptionService.setUnsubscriptionHandle(id, subscription.unsubscribe);

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

  private async walletConnectDappPairing() {
    return this.state.walletConnectDappService.initPairing();
  }

  changeMasterPassword(request: RequestChangePassword): boolean {
    this.state.keyringLockService.setExtensionAutoLockTimeout();

    return this.state.keyringService.changeMasterPassword(request as RequestChangePassword);
  }

  lockKeyring(skipCheck: boolean): boolean {
    if (!skipCheck && this.state.keyringLockService.lockTimerIsExist()) return false;

    this.state.keyringLockService.clearLockTimer();

    return this.state.keyringService.lockKeyring();
  }

  unlockKeyring(request: RequestUnlockExtension): boolean {
    this.state.keyringLockService.setExtensionAutoLockTimeout();

    const isSuccess = this.state.keyringService.unlockKeyring(request as RequestUnlockExtension);

    this.state.balanceService.tonBalanceService.fetchJettonInfo();

    return isSuccess;
  }

  async handle<TMessageType extends MessageTypes>(
    id: string,
    type: TMessageType,
    request: RequestTypes[TMessageType],
    port?: Port
  ): Promise<ResponseType<TMessageType>> {
    switch (type) {
      // App Management, networks
      case 'pri(app.port.ping)':
        return true;

      case 'pri(networkMap.upsert)':
        return this.upsertNetworkMap(request as NetworkJson);

      case 'pri(networkMap.toggle.favorite)':
        return this.toggleNetworkFavorite(request as string);

      case 'pri(window.open)':
        return this.windowOpen(request as string);

      // keyring
      case 'pri(keyring.hasMasterPassword)':
        return this.state.keyringService.hasMasterPassword;

      case 'pri(keyring.hasAccounts)':
        return this.state.keyringService.hasAccounts;

      case 'pri(keyring.keyringIsLocked)':
        return this.state.keyringService.keyringIsLocked;

      case 'pri(keyring.changePassword)':
        return this.changeMasterPassword(request as RequestChangePassword);

      case 'pri(keyring.unlock)':
        return this.unlockKeyring(request as RequestUnlockExtension);

      case 'pri(keyring.lock)':
        return this.lockKeyring(request as boolean);

      case 'pri(keyring.getPassword)':
        return this.state.keyringService.getPassword();

      case 'pri(keyring.reset)':
        return this.state.keyringService.resetWallet();

      case 'pri(keyring.getMigrationAccounts)':
        return this.state.keyringService.getMigrationAccounts();

      case 'pri(keyring.isNeedMigration)':
        return this.state.keyringService.isNeedMigration();

      case 'pri(keyring.migrateMasterPassword)':
        return this.state.keyringService.keyringMigrateMasterPassword(request as RequestMigratePassword);

      case 'pri(keyring.export.mnemonic)':
        return this.state.keyringService.exportMnemonic(request as RequestExportSeed);

      case 'pri(keyring.export.rowSeed)':
        return this.state.keyringService.accountExportRawSeed(request as RequestExportSeed);

      case 'pri(keyring.generateMnemonic)':
        return this.state.keyringService.mnemonicGenerate(request as RequestGenerateMnemonic);

      case 'pri(keyring.mnemonicValidate)':
        return this.state.keyringService.mnemonicValidate(request as RequestValidateMnemonic);

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
        return this.state.balanceService.getTotalBalances();

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

      case 'pri(accounts.soraFees.subscribe)':
        return this.soraFeesSubscribe(id, port);

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

      case 'pri(walletConnect.notSupport.reject)':
        return this.rejectWalletConnectNotSupport(request as RequestRejectWalletConnectNotSupport);

      // WalletConnect mobilewallet
      case 'pri(walletConnect.app.subscribePairing)':
        return this.walletConnectDappSubscribePairing(request as string, id, port);

      case 'pri(walletConnect.app.pairing)':
        return this.walletConnectDappPairing();

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
