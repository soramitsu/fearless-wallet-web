import { getInternalError, getSdkError } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import {
  PROJECT_ID_EXTENSION,
  SUBSTRATE_EVM_HALF_CHAINID,
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_METADATA,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
} from '@extension-base/services/wallet-connect-service/consts';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
import {
  generateHalfGenesisHash,
  getEip155MessageAddress,
  parseRequestParams,
} from '@extension-base/services/wallet-connect-service/utils';
import registry from '@extension-base/api/substrate/typeRegistry';
import { isRequireEvmAPI } from '@extension-base/background/utils/utils';
import Provider from '@walletconnect/universal-provider';
import { createSubscription } from '@extension-base/services';
import {
  EIP155_SIGNING_METHODS,
  type AppSessionInitResponse,
  type PairingSubjectType,
  type WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import { formatJsonRpcError, formatJsonRpcResult } from '@json-rpc-tools/utils';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type State from '@extension-base/background/handlers/State';
import type { SessionTypes } from '@walletconnect/types';
import type { Port } from '@extension-base/background/types/types';
import { isSameAddress } from '@/extension/background/extension-base/src/utils';

export class WalletConnectDAppService {
  state: State;
  private app?: Provider;

  public readonly uriSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public readonly pairingSubject: BehaviorSubject<Record<string, AppSessionInitResponse>> = new BehaviorSubject<
    Record<string, AppSessionInitResponse>
  >({});

  constructor(state: State) {
    this.state = state;
    this.initApp().catch(console.error);
  }

  private async initApp() {
    this.app = await Provider.init({
      projectId: PROJECT_ID_EXTENSION,
      metadata: WALLET_CONNECT_METADATA,
      logger: undefined,
      storage: new WalletConnectStorage(),
    });

    this.setListeners();
  }

  public get sessions(): SessionTypes.Struct[] {
    return this.app?.client.session.values || [];
  }

  private setListeners() {
    this.app?.client.pairing.core.on('pairing_expire', (data: { id: number; topic: string }) =>
      this.onSessionDelete(data)
    );
    this.app?.client.on('session_delete', (data: { id: number; topic: string }) => this.onSessionDelete(data));
  }

  checkClient() {
    if (!this.app) {
      throw new Error(getInternalError('NOT_INITIALIZED').message);
    }
  }

  private updatePairing(key: string, data: AppSessionInitResponse) {
    this.pairingSubject.next({ ...this.pairingSubject.value, [key]: data });
  }

  public getSession(topic: string): SessionTypes.Struct {
    const session = this.sessions.find((el) => el.topic === topic);

    if (!session) {
      throw new Error(getInternalError('MISMATCHED_TOPIC').message);
    } else {
      return session;
    }
  }

  async initPairing() {
    if (!this.app) await this.initApp();

    const optionalChains = this.state.networkService.networksGithub.flatMap((network) => {
      if (isRequireEvmAPI(network.name) || !network.chainId) return [];
      const halfChainId = network.chainId.slice(0, Math.ceil(network.chainId.length / 2));

      return [`polkadot:${halfChainId}`];
    });

    const optionalEvmChains = this.state.networkService.networksGithub.flatMap((network) => {
      if (!isRequireEvmAPI(network.name) || !network.chainId) return [];

      const halfChainId = network.chainId.slice(0, Math.ceil(network.chainId.length / 2));

      return [`eip155:${halfChainId}`];
    });

    const pairing = await this.app?.client.connect({
      requiredNamespaces: {
        polkadot: {
          methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
          chains: [
            'polkadot:91b171bb158e2d3848fa23a9f1c25182', //dot
            'polkadot:7e4e32d0feafd4f9c9414b0be86373f9', //sora mainnet
            'polkadot:401a1f9dca3da46f5c4091016c8a2f26', //moonriver
          ],
          events: [],
        },
        eip155: {
          chains: ['eip155:1'],
          methods: ['eth_sendTransaction', 'personal_sign'],
          events: ['accountsChanged', 'chainChanged'],
        },
      },
      optionalNamespaces: {
        polkadot: {
          methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
          chains: optionalChains,
          events: [],
        },
        eip155: {
          chains: optionalEvmChains,
          methods: ['eth_sendTransaction', 'personal_sign'],
          events: ['accountsChanged', 'chainChanged'],
        },
      },
    });

    this.setListeners();

    if (!pairing?.uri) throw new Error('uri error');
    this.updatePairing(pairing.uri, pairing);

    return pairing?.uri;
  }

  public async subscribePairing(uri: string, id: string, port: Port) {
    const cb = createSubscription<'pri(walletConnect.app.subscribePairing)'>(id, port);

    this.state.createUnsubscriptionHandle(id, () => {});

    port.onDisconnect.addListener((): void => {
      this.state.cancelSubscription(id);
    });

    const activePairing = this.pairingSubject.value[uri];

    if (!activePairing) {
      cb({
        status: false,
        message: 'ERROR',
      });

      return;
    }

    activePairing
      ?.approval()
      .then((data) => this.onAuthApproval(data, cb))
      .catch(() => cb({ status: false, message: 'rejected' }));

    return this.pairingSubject.value?.uri;
  }

  onAuthApproval(data: SessionTypes.Struct, cb: (data: PairingSubjectType) => void) {
    const accounts = data.namespaces[WALLET_CONNECT_POLKADOT_NAMESPACE].accounts;
    const substrateAddress = accounts.find((el) => {
      const [, chainId] = el.split(':');

      return !SUBSTRATE_EVM_HALF_CHAINID.includes(chainId);
    });

    if (!substrateAddress) throw new Error("couldn't find substrate address");

    const [, , address] = substrateAddress.split(':');
    const encodedAddress = this.state.keyringService.encodeAddress(address);
    const ethAddress = accounts.find((el) => {
      const [, chainId] = el.split(':');

      return SUBSTRATE_EVM_HALF_CHAINID.includes(chainId);
    });
    let ethereumAddressWC;

    if (ethAddress) {
      const [, , ethereumAddress] = ethAddress.split(':');
      ethereumAddressWC = ethereumAddress;
    }

    const availableSubstrateNetworks =
      data.namespaces[WALLET_CONNECT_POLKADOT_NAMESPACE].chains?.map((el) => el.split(':')[1]) ?? [];
    const availableEvmNetworks =
      data.namespaces[WALLET_CONNECT_EIP155_NAMESPACE].chains?.map((el) => el.split(':')[1]) ?? [];
    const isDuplicate = this.state.keyringService.getAllAccounts().some(({ address }) => address === encodedAddress);

    if (isDuplicate) {
      this.disconnect(data.topic);
      cb({
        status: false,
        message: 'duplicate',
      });

      return;
    }

    this.state.keyringService.saveAddress(
      encodedAddress,
      {
        name: data.peer.metadata.name,
        isMobile: true,
        wcTopic: data.topic,
        ethereumAddress: ethereumAddressWC,
        chains: [...availableSubstrateNetworks, ...availableEvmNetworks],
      },
      'address'
    );
    this.state.updateCurrentAccount(encodedAddress);

    cb({ status: true });
  }

  disconnect(topic: string) {
    this.app?.client.disconnect({ topic, reason: getSdkError('USER_DISCONNECTED') });
  }

  availableNetworks(address: string) {
    const pairing = this.state.keyringService.getAddress(address);
    if (!pairing) return [];

    const session = this.sessions.find((session) => session.topic === pairing.meta.wcTopic);

    if (session) return session.namespaces['polkadot'].chains?.map((chain) => chain.split(':')[1]) ?? [];

    return [];
  }

  abortPairingAttempt() {
    this.app?.abortPairingAttempt();
  }

  async onSessionDelete({ topic }: { id: number; topic: string }) {
    const account = this.state.keyringService.getAddresses().find((el) => el.meta.wcTopic === topic);

    if (account) {
      const current = this.state.currentAccount;
      this.state.keyringService.forgetAddress(account?.address);

      if (current?.address === account.address) {
        const accounts = this.state.keyringService.getSubstrateAccounts();

        if (accounts.length) this.state.updateCurrentAccount(accounts[0].address);
        else this.state.setCurrentAccount(null);
      }

      this.state.cleanupDeletedAccount(account.address);
    }
  }

  async onRequest(payload: SignerPayloadJSON) {
    const encodedAddress = this.state.keyringService.encodeAddress(payload.address);
    const account = this.state.keyringService.getAddress(encodedAddress);

    const chainId = payload.genesisHash.slice(2);
    const halfChainid = chainId.slice(0, Math.ceil(chainId.length / 2));

    const request = {
      chainId: `polkadot:${halfChainid}`,
      topic: account?.meta.wcTopic as string,
      request: {
        method: 'polkadot_signTransaction',
        params: {
          address: payload.address,
          transactionPayload: payload,
        },
      },
    };
    const result = await this.app?.client
      .request<{ signature: HexString }>(request)

      .catch(() => {
        return { signature: '0x' as HexString };
      });

    return result as unknown as { signature: HexString };
  }

  async onRequestRaw(payload: SignerPayloadRaw) {
    const encodedAddress = this.state.keyringService.encodeAddress(payload.address);
    const account = this.state.keyringService.getAddress(encodedAddress);
    const payloadJson = registry.createType('Extrinsic', payload.data) as unknown as SignerPayloadJSON;

    const result = await this.app?.client.request<{ signature: HexString }>({
      chainId: `polkadot:${generateHalfGenesisHash(payloadJson.genesisHash)}`,
      topic: account?.meta.wcTopic as string,
      request: {
        method: 'polkadot_signTransaction',
        params: {
          address: payload.address,
          transactionPayload: payload.data,
        },
      },
    });

    return result ?? { signature: '0x' as HexString };
  }

  private handleError(topic: string, id: number, e: unknown) {
    let message = (e as Error).message;

    if (message.includes('User Rejected Request')) {
      message = getSdkError('USER_REJECTED').message;
    }

    this.state.walletConnectService
      .responseRequest({
        topic,
        response: formatJsonRpcError(id, message),
      })
      .catch(console.error);
  }

  public onEvmRequest(id: string, method: EIP155_SIGNING_METHODS, params: any) {
    const { chainId: _chainId, request } = params;
    const topic = typeof params === 'object' ? params.data[0].from : '';
    const requestSession = this.getSession(topic);

    const sessionAccounts = requestSession.namespaces.eip155.accounts.map((account) => account.split(':')[2]);
    const requestEvent: WalletConnectTransactionRequest = {
      id: +id,
      params,
      topic,
      verifyContext: {
        verified: {
          origin: '',
          validation: 'VALID',
          verifyUrl: '',
        },
      },
    };

    if (
      [
        EIP155_SIGNING_METHODS.PERSONAL_SIGN,
        EIP155_SIGNING_METHODS.ETH_SIGN,
        EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA,
        EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3,
        EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4,
      ].includes(method)
    ) {
      const address = getEip155MessageAddress(method, request.params);

      this.checkAccount(address, sessionAccounts);

      this.state.requestService.evmRequestHandler
        .onWCSign(requestEvent)
        .then(async ({ payload }) => {
          const response = formatJsonRpcResult(+id, payload);
          this.state.walletConnectService.responseRequest({ topic, response });
        })
        .catch((e: any) => this.handleError(topic, +id, e));
    } else if (method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
      const [tx] = parseRequestParams<EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION>(request.params);

      const address = tx.from;

      this.state.walletConnectService.eip155RequestHandler.checkAccount(address, sessionAccounts);

      const chainId = _chainId.split(':')[1];

      const [networkKey, chainInfo] = this.state.networkService.findNetworkKeyByChainId(chainId);

      if (!networkKey || !chainInfo) {
        throw new Error(getSdkError('UNSUPPORTED_CHAINS').message + ' ' + address);
      }

      const chainState = this.state.networkMap[networkKey];

      const createRequest = () => {
        this.state.requestService.evmRequestHandler
          .onWCSign(requestEvent)
          .then(async ({ payload }) => {
            await this.state.walletConnectService.responseRequest({
              topic,
              response: formatJsonRpcResult(+id, payload),
            });
          })
          .catch((e) => {
            this.handleError(topic, +id, e);
          });
      };

      if (!chainState.active) {
        this.state
          .setActiveNetworks(networkKey)
          .then(createRequest)
          .catch(() => {
            throw new Error(getSdkError('USER_REJECTED').message + ' Can not active chain: ' + chainInfo.name);
          });
      } else {
        createRequest();
      }
    } else {
      throw Error(getSdkError('INVALID_METHOD').message + ' ' + method);
    }
  }

  checkAccount(address: string, accounts: string[]) {
    if (!accounts.find((account) => isSameAddress(account, address))) {
      throw new Error(getSdkError('UNSUPPORTED_ACCOUNTS').message + ' ' + address);
    }
  }
}
