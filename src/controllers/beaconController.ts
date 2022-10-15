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
import type {
  PermissionErrorPayload,
  PermissionSuccess,
  RequestSentInfo,
  SignResponse,
  SubstratePermissionRequest,
  SubstrateSignPayloadRequest,
  SubstrateSignPayloadResponse,
  SubstrateTransferRequest,
  TCallback,
  TransferPayload,
  SignerPayloadJSON,
} from '@/interfaces';

import { getTzip10Link } from '@/util/beacon';

class BeaconController {
  private readonly app: DAppClient;
  public serializer = new Serializer();
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
        networks: [
          { genesisHash: '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3' },
          // { genesisHash: '0x7e6b3bbed86828a558271c9c9f62354b1d8b5aa15ff85fd6f1e7cbe9af9dde7e' },
        ],
        scopes: [SubstratePermissionScope.transfer, SubstratePermissionScope.sign_payload_json],
      },
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.PermissionRequest,
    };

    await this.app.permissionRequest(config);
  }

  async onPairingRequest(callback: (payload: string) => void) {
    this.app.subscribeToEvent(BeaconEvent.PAIR_INIT, async (data) => {
      const code = await this.serializer.serialize(await data.p2pPeerInfo());
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

  async sendTransfer(payload: TransferPayload) {
    const activeAccount = await this.app.getActiveAccount();

    if (!activeAccount) throw new Error('Beacon not set up.');

    const request: SubstrateTransferRequest = {
      accountId: activeAccount.accountIdentifier,
      blockchainData: {
        ...payload,
        mode: 'return',
        type: SubstrateMessageType.transfer_request,
        scope: SubstratePermissionScope.transfer,
      },
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.BlockchainRequest,
    };

    return this.app.request(request);
  }

  async sendRequest(payload: SignerPayloadJSON) {
    const activeAccount = await this.app.getActiveAccount();

    if (!activeAccount) throw new Error('Beacon not set up.');
    const request: SubstrateSignPayloadRequest = {
      accountId: activeAccount.accountIdentifier,
      blockchainData: {
        mode: 'submit-and-return',
        payload,
        type: SubstrateMessageType.sign_payload_request,
        scope: SubstratePermissionScope.sign_payload_json,
      },
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.BlockchainRequest,
    };

    const response = (await this.app.request(request)) as SubstrateSignPayloadResponse;

    return response;
  }
}

export const beaconController = BeaconController.create();
