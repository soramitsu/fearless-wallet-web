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
  AccountInfo,
} from '@airgap/beacon-sdk';

import type { SignerPayloadJSON } from '@polkadot/types/types';
import { getTzip10Link } from '@/util/beacon';

import {
  PermissionErrorPayload,
  PermissionSuccess,
  RequestSentInfo,
  SignResponse,
  SubstratePermissionRequest,
  SubstrateSignPayloadRequest,
  SubstrateSignPayloadResponse,
  TCallback,
} from '@/interfaces';

class BeaconController {
  private readonly app: DAppClient;
  private static serializer = new Serializer();
  private name = 'Fearless Wallet Extension';
  constructor() {
    this.app = getDAppClientInstance({
      name: 'Fearless Wallet Extension',
      disableDefaultEvents: true,
      eventHandlers: {
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

  async resetConnection() {
    await this.app.setActiveAccount();
    await this.app.disconnect();
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

  async onSignRequest(callback: TCallback<RequestSentInfo>) {
    this.app.subscribeToEvent(BeaconEvent.SIGN_REQUEST_SENT, callback);
  }

  async onBlockChainRequest(callback: TCallback<SignResponse>) {
    this.app.subscribeToEvent(BeaconEvent.SIGN_REQUEST_SUCCESS, callback);
  }

  async onPermissionRequest(callback: TCallback<RequestSentInfo>) {
    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SENT, callback);
  }

  async onPermissionsResponse(callback: TCallback<PermissionSuccess>) {
    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SUCCESS, callback);
  }

  async onPermissionsError(callback: TCallback<PermissionErrorPayload>) {
    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_ERROR, callback);
  }

  disconnect() {
    this.app.disconnect();
  }

  setActiveAccount(account: AccountInfo) {
    this.app.setActiveAccount(account);
  }

  removeActiveAccount() {
    this.app.clearActiveAccount();
  }

  async sendRequest(payload: SignerPayloadJSON): Promise<SubstrateSignPayloadResponse['blockchainData']> {
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

    const { blockchainData } = (await this.app.request(request)) as SubstrateSignPayloadResponse;

    return blockchainData;
  }
}

export const beaconController = BeaconController.create();
