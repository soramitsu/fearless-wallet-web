import UniversalProvider from '@walletconnect/universal-provider';
import { getInternalError, getSdkError } from '@walletconnect/utils';
import { BehaviorSubject } from 'rxjs';
import { createSubscription } from '@extension-base/background/handlers/subscriptions';
import {
  DEFAULT_LOGGER,
  PROJECT_ID_EXTENSION,
  SUBSTRATE_EVM_HALF_CHAINID,
  WALLET_CONNECT_METADATA,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
} from '@extension-base/services/wallet-connect-service/consts';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
import { generateHalfGenesisHash } from '@extension-base/services/wallet-connect-service/utils';
import registry from '@extension-base/api/substrate/typeRegistry';
import { isRequireEvmAPI } from '@extension-base/background/utils/utils';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type State from '@extension-base/background/handlers/State';
import type { SessionTypes } from '@walletconnect/types';
import type { AppSessionInitResponse, PairingSubjectType } from '@extension-base/services/wallet-connect-service/types';
import type { Port } from '@extension-base/background/types/types';

export default class WalletConnectDAppService {
  state: State;
  private app?: UniversalProvider;

  public readonly uriSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public readonly pairingSubject: BehaviorSubject<Record<string, AppSessionInitResponse>> = new BehaviorSubject<
    Record<string, AppSessionInitResponse>
  >({});

  constructor(state: State) {
    this.state = state;
    this.initApp().catch(console.error);
  }

  private async initApp() {
    this.app = await UniversalProvider.init({
      projectId: PROJECT_ID_EXTENSION,
      metadata: WALLET_CONNECT_METADATA,
      logger: process.env.NODE_ENV === 'development' ? DEFAULT_LOGGER : undefined,
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

  async initPairing() {
    if (!this.app) await this.initApp();

    const optionalChains = this.state.networksGithub.flatMap((network) => {
      if (isRequireEvmAPI(network.name) || !network.chainId) return [];
      const halfChainId = network.chainId.slice(0, Math.ceil(network.chainId.length / 2));

      return [`polkadot:${halfChainId}`];
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
      },
      optionalNamespaces: {
        polkadot: {
          methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
          chains: optionalChains,
          events: [],
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
      .then((data) => this.onApproval(data, cb))
      .catch(() => cb({ status: false, message: 'rejected' }));

    return this.pairingSubject.value?.uri;
  }

  onApproval(data: SessionTypes.Struct, cb: (data: PairingSubjectType) => void) {
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

    const availableNetworks =
      data.namespaces[WALLET_CONNECT_POLKADOT_NAMESPACE].chains?.map((el) => el.split(':')[1]) ?? [];
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
        chains: availableNetworks,
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
      const current = await this.state.currentAccount;
      this.state.keyringService.forgetAddress(account?.address);

      if (current?.address === account.address) {
        const accounts = this.state.getSubstrateAccounts();

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
}
