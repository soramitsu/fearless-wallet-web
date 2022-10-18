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
  TCallback,
  BeaconPayloadJSON,
} from '@/interfaces';

import { getTzip10Link } from '@/util/beacon';
class BeaconController {
  private readonly app: DAppClient;
  private qr = '';
  private serializer = new Serializer();
  private name = 'Fearless Wallet Extension';
  public isConnected = false;
  private appMetaData: AppMetadata = {
    senderId: 'fearless-wallet-extension',
    name: this.name,
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

  public status() {
    console.info(this.app.connectionStatus);
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
        networks: [{ genesisHash: '0xe143f23803ac50e8f6f8e62695d1ce9e4e1d68aa36c1cd2cfd15340213f3423e' }],
        scopes: [SubstratePermissionScope.sign_payload_raw, SubstratePermissionScope.sign_payload_json],
      },
    };

    await this.app.permissionRequest(config);
    this.isConnected = true;
  }

  public init() {
    this.app.init();
  }

  get beaconQR() {
    return this.qr;
  }

  set beaconQR(payload: string) {
    this.qr = payload;
  }

  public async onPairingRequest(callback: (payload: string) => void) {
    this.status();
    this.app.subscribeToEvent(BeaconEvent.PAIR_INIT, async (data) => {
      const code = await this.serializer.serialize(await data.p2pPeerInfo());
      const uri = getTzip10Link('tezos://', code);
      localStorage.setItem('beaconQR', uri);
      this.beaconQR = uri;
      callback(uri);
    });
  }

  public async onSignRequest(callback: TCallback<RequestSentInfo>) {
    this.app.subscribeToEvent(BeaconEvent.SIGN_REQUEST_SENT, callback);
  }

  public async onBlockChainRequest(callback: TCallback<SignResponse>) {
    this.status();
    this.app.subscribeToEvent(BeaconEvent.SIGN_REQUEST_SUCCESS, callback);
  }

  public async onPermissionRequest(callback: TCallback<RequestSentInfo>) {
    this.status();
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

  public async sendRequestJSON(payload: BeaconPayloadJSON) {
    const activeAccount = await this.app.getActiveAccount();

    if (!activeAccount) throw new Error('Beacon not set up.');
    const request: SubstrateSignPayloadRequest = {
      accountId: activeAccount.accountIdentifier,
      blockchainData: {
        mode: 'return',
        payload: payload,
        type: SubstrateMessageType.sign_payload_request,
        scope: SubstratePermissionScope.sign_payload_json,
      },
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.BlockchainRequest,
    };

    const response = (await this.app.request(request)) as SubstrateSignPayloadResponse;

    return response;
  }

  public async sendRequestRaw(payload: SubstrateSignPayloadRequest) {
    const response = await this.app.request(payload);

    console.log(response, 'RESPONSE RAW');

    return response;
  }
}

export const beaconController = BeaconController.create();
