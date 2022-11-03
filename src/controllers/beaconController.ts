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
  PayloadJSON,
  PermissionSuccess,
  RequestSentInfo,
  SubstrateSignPayloadJSONResponse,
  SubstratePermissionRequest,
  SubstrateSignPayloadRequest,
  TCallback,
} from '@/interfaces';
import { MOONBEAM_GENESISHASH, WESTEND_GENESISHASH } from '@/consts/networks';

class BeaconController {
  private app: DAppClient;
  private serializer = new Serializer();
  private readonly name = 'Fearless Wallet Extension';
  readonly appMetaData: AppMetadata = {
    senderId: 'fearless-wallet-extension',
    name: this.name,
  };

  constructor() {
    this.app = getDAppClientInstance({
      name: this.name,
      disableDefaultEvents: true,
      eventHandlers: {
        INTERNAL_ERROR: {
          handler: (error) => {
            console.error('INTERNAL ERROR', error);
          },
        },
        UNKNOWN: {
          handler: (error) => {
            console.error('UNKNOWN ERROR', error);
          },
        },
      },
    });

    this.addSubstrateBlockchain();
  }

  addSubstrateBlockchain() {
    this.app.addBlockchain(new SubstrateBlockchain());
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
    await this.app.disconnect();
  }

  public async connect() {
    const config: SubstratePermissionRequest = {
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.PermissionRequest,
      blockchainData: {
        appMetadata: this.appMetaData,
        networks: [
          {
            genesisHash: WESTEND_GENESISHASH,
          },
          {
            genesisHash: MOONBEAM_GENESISHASH,
          },
        ],
        scopes: [SubstratePermissionScope.sign_payload_raw, SubstratePermissionScope.sign_payload_json],
      },
    };

    await this.app.permissionRequest(config);
  }

  private getTzip10Link(url: string, payload: string) {
    return `${url}?type=tzip10&data=${payload}`;
  }

  public async onPairingRequest(callback: (payload: string) => void) {
    this.app.subscribeToEvent(BeaconEvent.PAIR_INIT, async (data) => {
      const code = await this.serializer.serialize(await data.p2pPeerInfo());
      const uri = this.getTzip10Link('substrate://', code);

      callback(uri);
    });
  }

  public async onPairingSuccess(callback: () => void) {
    this.app.subscribeToEvent(BeaconEvent.PAIR_SUCCESS, callback);
  }

  public async onPermissionRequest(callback: TCallback<RequestSentInfo>) {
    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SENT, callback);
  }

  public async onPermissionsResponse(callback: TCallback<PermissionSuccess>) {
    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SUCCESS, callback as any);
  }

  public setActiveAccount(account: AccountInfo) {
    this.app.setActiveAccount(account);
  }

  public removeActiveAccount() {
    this.app.clearActiveAccount();
  }

  public async sendRequestJSON(payload: PayloadJSON): Promise<SubstrateSignPayloadJSONResponse> {
    const activeAccount = (await this.app.getActiveAccount()) as AccountInfo;

    const request: SubstrateSignPayloadRequest = {
      type: BeaconMessageType.BlockchainRequest,
      accountId: activeAccount.accountIdentifier,
      blockchainIdentifier: 'substrate',
      blockchainData: {
        mode: 'return',
        payload,
        type: SubstrateMessageType.sign_payload_request,
        scope: SubstratePermissionScope.sign_payload_json,
      },
    };

    return this.app.request(request) as Promise<SubstrateSignPayloadJSONResponse>;
  }

  public sendRequestRaw(payload: SubstrateSignPayloadRequest) {
    return this.app.request(payload);
  }
}

export const beaconController = BeaconController.create();
