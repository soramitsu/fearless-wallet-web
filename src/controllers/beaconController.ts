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
  AppMetadata,
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
  BeaconPayloadJSON,
} from '@/interfaces';

import { getTzip10Link } from '@/util/beacon';
import { WALLET_ICON } from '@/consts/walletInformation';
class BeaconController {
  private readonly app: DAppClient;
  private serializer = new Serializer();
  private name = 'Fearless Wallet Extension';
  private appMetaData: AppMetadata = {
    senderId: 'fearless-wallet-extension',
    name: this.name,
    icon: WALLET_ICON,
  };

  constructor() {
    this.app = getDAppClientInstance({
      name: 'Fearless Wallet Extension',
      disableDefaultEvents: true,
      eventHandlers: {
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

  public static create() {
    return new BeaconController();
  }

  public getAccounts() {
    return this.app.getAccounts();
  }

  public getActiveAccount() {
    return this.app.getActiveAccount();
  }

  public async resetConnection() {
    await this.app.removeAllAccounts();
    await this.app.disconnect();
  }

  public async connect() {
    const config: SubstratePermissionRequest = {
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.PermissionRequest,
      blockchainData: {
        appMetadata: this.appMetaData,
        networks: [{ genesisHash: '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3' }],
        scopes: [SubstratePermissionScope.transfer, SubstratePermissionScope.sign_payload_json],
      },
    };

    await this.app.permissionRequest(config);
  }

  public init() {
    this.app.init();
  }

  public async onPairingRequest(callback: (payload: string) => void) {
    this.app.subscribeToEvent(BeaconEvent.PAIR_INIT, async (data) => {
      const code = await this.serializer.serialize(await data.p2pPeerInfo());
      const uri = getTzip10Link('tezos://', code);
      if (callback) callback(uri);
    });
  }

  public async onSignRequest(callback: TCallback<RequestSentInfo>) {
    this.app.subscribeToEvent(BeaconEvent.SIGN_REQUEST_SENT, callback);
  }

  public async onBlockChainRequest(callback: TCallback<SignResponse>) {
    this.app.subscribeToEvent(BeaconEvent.SIGN_REQUEST_SUCCESS, callback);
  }

  public async onPermissionRequest(callback: TCallback<RequestSentInfo>) {
    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SENT, callback);
  }

  public async onPermissionsResponse(callback: TCallback<PermissionSuccess>) {
    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SUCCESS, callback);
  }

  public async onPermissionsError(callback: TCallback<PermissionErrorPayload>) {
    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_ERROR, callback);
  }

  public disconnect() {
    this.app.disconnect();
    this.app.removeAllPeers();
  }

  public setActiveAccount(account: AccountInfo) {
    this.app.setActiveAccount(account);
  }

  public removeActiveAccount() {
    this.app.clearActiveAccount();
  }

  public async sendTransfer(payload: TransferPayload) {
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

  public async sendRequest(payload: BeaconPayloadJSON) {
    const activeAccount = await this.app.getActiveAccount();

    if (!activeAccount) throw new Error('Beacon not set up.');
    const request: SubstrateSignPayloadRequest = {
      accountId: activeAccount.accountIdentifier,
      blockchainData: {
        mode: 'submit-and-return',
        payload: JSON.stringify(payload),
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
