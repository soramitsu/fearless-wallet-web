import {
  BeaconMessageType,
  DAppClient,
  SubstrateBlockchain,
  SubstrateMessageType,
  SubstratePermissionScope,
  getDAppClientInstance,
  BeaconEvent,
  defaultEventCallbacks,
  Serializer,
} from '@airgap/beacon-sdk';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import { getTzip10Link } from '@/util/beacon';

import {
  PermissionSuccess,
  RequestSentInfo,
  SignResponse,
  SubstratePermissionRequest,
  SubstrateSignPayloadRequest,
} from '@/interfaces/beacon';

class BeaconController {
  private readonly app: DAppClient;
  private static serializer = new Serializer();
  private name = 'Fearless Wallet Extension';
  constructor() {
    this.app = getDAppClientInstance({
      name: 'Fearless Wallet Extension',
      disableDefaultEvents: true,
      eventHandlers: {
        [BeaconEvent.PAIR_SUCCESS]: {
          handler: defaultEventCallbacks.PAIR_SUCCESS,
        },
        [BeaconEvent.PERMISSION_REQUEST_SENT]: {
          handler: defaultEventCallbacks.PERMISSION_REQUEST_SENT,
        },
        [BeaconEvent.PERMISSION_REQUEST_SUCCESS]: {
          handler: defaultEventCallbacks.PERMISSION_REQUEST_SUCCESS,
        },
        [BeaconEvent.PERMISSION_REQUEST_ERROR]: {
          handler: defaultEventCallbacks.PERMISSION_REQUEST_ERROR,
        },
        [BeaconEvent.SIGN_REQUEST_SENT]: {
          handler: defaultEventCallbacks.SIGN_REQUEST_SENT,
        },
        [BeaconEvent.SIGN_REQUEST_SUCCESS]: {
          handler: defaultEventCallbacks.SIGN_REQUEST_SUCCESS,
        },
        [BeaconEvent.SIGN_REQUEST_ERROR]: {
          handler: defaultEventCallbacks.SIGN_REQUEST_ERROR,
        },
      },
    });

    const substrateBlockchain = new SubstrateBlockchain();

    this.app.addBlockchain(substrateBlockchain);
  }

  static create() {
    return new BeaconController();
  }

  getAccounts() {
    return this.app.getActiveAccount();
  }

  async connect() {
    const config: SubstratePermissionRequest = {
      blockchainData: {
        appMetadata: {
          senderId: 'sender',
          name: this.name,
        },
        networks: [{ genesisHash: '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3' }], //Polkadot genesis hash
        scopes: [SubstratePermissionScope.transfer],
      },
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.PermissionRequest,
    };

    await this.app.permissionRequest(config);
  }

  async onPairingRequest(callback: (payload: string) => void) {
    this.app.subscribeToEvent(BeaconEvent.PAIR_INIT, async (data) => {
      const code = await BeaconController.serializer.serialize(await data.p2pPeerInfo());
      const uri = getTzip10Link('tezos://', code);
      if (callback) callback(uri);
    });
  }

  async onSignRequest(callback: (payload: RequestSentInfo) => void) {
    this.app.subscribeToEvent(BeaconEvent.SIGN_REQUEST_SENT, callback);
  }

  async onBlockChainRequest(callback: (payload: SignResponse) => void) {
    this.app.subscribeToEvent(BeaconEvent.SIGN_REQUEST_SUCCESS, callback);
  }

  async onPermissionsResponse(callback: (payload: PermissionSuccess) => void) {
    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SUCCESS, callback);
  }

  disconnect() {
    this.app.disconnect();
  }

  async sendRequest(payload: SignerPayloadJSON): Promise<void> {
    const activeAccount = await this.app.getActiveAccount();

    if (!activeAccount) throw new Error('Beacon not set up.');

    const request: SubstrateSignPayloadRequest = {
      accountId: activeAccount.accountIdentifier,
      blockchainData: {
        mode: 'return',
        payload,
        type: SubstrateMessageType.sign_payload_request,
        scope: SubstratePermissionScope.sign_payload_json,
      },
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.BlockchainRequest,
    };

    await this.app.request(request);
  }
}

export const fearlessConnector = BeaconController.create();
