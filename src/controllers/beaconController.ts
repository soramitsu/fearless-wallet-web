import {
  BeaconMessageType,
  DAppClient,
  SubstrateBlockchain,
  SubstrateMessageType,
  SubstratePermissionScope,
  getDAppClientInstance,
  BeaconEvent,
  Serializer,
  AccountInfo,
  AppMetadata,
} from '@airgap/beacon-sdk';
import type {
  BeaconNetworks,
  PayloadJSON,
  PermissionErrorPayload,
  PermissionSuccess,
  RequestSentInfo,
  SubstrateSignPayloadJSONResponse,
  SubstratePermissionRequest,
  SubstrateSignPayloadRequest,
  TCallback,
} from '@/interfaces';
import { getTzip10Link } from '@/util/beacon';
class BeaconController {
  private app: DAppClient;
  private serializer = new Serializer();
  private name = 'Fearless Wallet Extension';
  private appMetaData: AppMetadata = {
    senderId: 'fearless-wallet-extension',
    name: this.name,
  };

  constructor() {
    this.app = getDAppClientInstance({
      name: 'Fearless Wallet Extension',
      disableDefaultEvents: true,
    });

    this.addSubstrateBlockchain();
  }

  addSubstrateBlockchain() {
    this.app.addBlockchain(new SubstrateBlockchain());
  }

  public static create() {
    return new BeaconController();
  }

  createApp() {
    this.app = getDAppClientInstance({
      name: 'Fearless Wallet Extension',
      disableDefaultEvents: true,
    });

    this.addSubstrateBlockchain();
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
    await this.app.removeAllPeers();
    await this.app.disconnect();
  }

  public async connect(networks: BeaconNetworks) {
    const config: SubstratePermissionRequest = {
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.PermissionRequest,
      blockchainData: {
        appMetadata: this.appMetaData,
        networks,
        scopes: [SubstratePermissionScope.sign_payload_raw, SubstratePermissionScope.sign_payload_json],
      },
    };

    await this.app.permissionRequest(config);
  }

  public async onPairingRequest(callback: (payload: string) => void) {
    this.app.subscribeToEvent(BeaconEvent.PAIR_INIT, async (data) => {
      const code = await this.serializer.serialize(await data.p2pPeerInfo());
      const uri = getTzip10Link('tezos://', code);

      callback(uri);
    });
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

  public setActiveAccount(account: AccountInfo) {
    this.app.setActiveAccount(account);
  }

  public removeActiveAccount() {
    this.app.clearActiveAccount();
  }

  public async sendRequestJSON(payload: PayloadJSON): Promise<SubstrateSignPayloadJSONResponse> {
    const activeAccount = (await this.app.getActiveAccount()) as AccountInfo;
    // const accounts = (activeAccount as any).chainData.accounts as any[];
    // const rightId = accounts.filter((el) => el.address === '5Fe7zknoeKQuMZbLhGYdhSa8n17dkhky13gKt6koHRE7iEzw') as any;
    // if (!activeAccount) throw new Error('Beacon not set up.');
    // console.log(rightId);
    const request: SubstrateSignPayloadRequest = {
      type: BeaconMessageType.BlockchainRequest,
      accountId: activeAccount.accountIdentifier,
      blockchainIdentifier: 'substrate',
      blockchainData: {
        mode: 'return',
        payload: payload,
        type: SubstrateMessageType.sign_payload_request,
        scope: SubstratePermissionScope.sign_payload_json,
      },
    };

    return this.app.request(request) as Promise<SubstrateSignPayloadJSONResponse>;
  }

  public async sendRequestRaw(payload: SubstrateSignPayloadRequest) {
    const response = await this.app.request(payload);

    console.info(response, 'RESPONSE RAW');

    return response;
  }
}

export const beaconController = BeaconController.create();
