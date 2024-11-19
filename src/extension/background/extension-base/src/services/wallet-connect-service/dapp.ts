import { getInternalError, getSdkError } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import {
  PROJECT_ID_EXTENSION,
  SUBSTRATE_EVM_HALF_CHAIN_IDS,
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
import Provider from '@walletconnect/universal-provider';
import { createSubscription } from '@extension-base/services';
import {
  EIP155_SIGNING_METHODS,
  type AppSessionInitResponse,
  type PairingSubjectType,
} from '@extension-base/services/wallet-connect-service/types';
import { isSameAddress } from '@extension-base/utils';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type State from '@extension-base/background/handlers/State';
import type { EngineTypes, SessionTypes } from '@walletconnect/types';
import type { Port, ResponseSigning } from '@extension-base/background/types/types';
import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';

export class WalletConnectDAppService {
  private app?: Provider;

  public readonly uriSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public readonly pairingSubject: BehaviorSubject<Record<string, AppSessionInitResponse>> = new BehaviorSubject<
    Record<string, AppSessionInitResponse>
  >({});

  constructor(private state: State) {
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
      if (isNativeEVMNetwork(network.name) || !network.chainId) return [];

      const halfChainId = network.chainId.slice(0, Math.ceil(network.chainId.length / 2));

      return [`polkadot:${halfChainId}`];
    });

    const optionalEvmChains = this.state.networkService.networksGithub.flatMap((network) => {
      if (!isNativeEVMNetwork(network.name) || !network.chainId) return [];

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
          ],
          events: [],
        },
        eip155: {
          chains: ['eip155:1'],
          methods: ['personal_sign', 'eth_sendTransaction'],
          events: [],
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
          methods: [
            'eth_sendTransaction',
            'personal_sign',
            'eth_sign',
            'eth_signTransaction',
            'eth_signTypedData',
            'eth_signTypedData_v1',
            'eth_signTypedData_v3',
            'eth_signTypedData_v4',
            'eth_sendRawTransaction',
          ],
          events: ['accountsChanged', 'chainChanged'],
        },
      },
    });

    this.setListeners();

    if (!pairing?.uri) throw new Error('uri error');
    this.updatePairing(pairing.uri, pairing);

    return pairing?.uri;
  }

  public async subscribePairing(uri: string, id: string, port?: Port) {
    const cb = createSubscription<'pri(walletConnect.app.subscribePairing)'>(id, port);

    this.state.createUnsubscriptionHandle(id, () => {});

    port?.onDisconnect.addListener((): void => {
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

      return !SUBSTRATE_EVM_HALF_CHAIN_IDS.includes(chainId);
    });

    if (!substrateAddress) throw new Error("couldn't find substrate address");

    const [, , address] = substrateAddress.split(':');
    const encodedAddress = this.state.keyringService.encodeAddress(address);
    const ethAddress = accounts.find((el) => {
      const [, chainId] = el.split(':');

      return SUBSTRATE_EVM_HALF_CHAIN_IDS.includes(chainId);
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
    const halfChainId = chainId.slice(0, Math.ceil(chainId.length / 2));

    const request = {
      chainId: `polkadot:${halfChainId}`,
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

  public async onEvmRequest(
    id: string,
    url: string,
    method: string,
    params: any,
    topic: string
  ): Promise<ResponseSigning> {
    const requestSession = this.getSession(topic);

    const sessionAccounts = requestSession.namespaces.eip155.accounts.map((account) => account.split(':')[2]);

    const authInfo = await this.state.getAuthInfo(url);

    if (!authInfo || !authInfo?.currentEvmNetworkKey) throw new Error(getSdkError('UNSUPPORTED_CHAINS').message);

    const networkKey = authInfo.currentEvmNetworkKey;
    const chainState = this.state.networkService.networkMap[networkKey];

    const requestEvent: EngineTypes.RequestParams = {
      chainId: `${WALLET_CONNECT_EIP155_NAMESPACE}:${chainState.chainId}`,
      request: {
        method,
        params,
      },
      topic,
    };

    const signMethods: string[] = [
      EIP155_SIGNING_METHODS.PERSONAL_SIGN,
      EIP155_SIGNING_METHODS.ETH_SIGN,
      EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA,
      EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3,
      EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4,
    ];

    if (!this.app) throw new Error('Wallet Connect is not init!');

    if (signMethods.includes(method)) {
      const address = getEip155MessageAddress(method, params);

      this.checkAccount(address, sessionAccounts);

      const res = await this.app.client.request<{ payload: HexString }>(requestEvent as any);

      return { id, payload: res.payload };
    }

    const [tx] = parseRequestParams<EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION>(params);

    const address = tx.from;

    this.state.walletConnectService.eip155RequestHandler.checkAccount(address, sessionAccounts);

    const createRequest = () => {
      if (!this.app) throw new Error('Wallet Connect is not init!');

      return this.app.client.request<{ payload: HexString }>(requestEvent as any);
    };

    if (!chainState.active) {
      await this.state.setActiveNetworks(networkKey);
    }

    const res = await createRequest();

    return {
      id,
      payload: res.payload,
    };
  }

  checkAccount(address: string, accounts: string[]) {
    if (!accounts.find((account) => isSameAddress(account, address))) {
      throw new Error(getSdkError('UNSUPPORTED_ACCOUNTS').message + ' ' + address);
    }
  }
}
