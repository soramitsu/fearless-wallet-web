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
  defaultEventCallbacks,
} from '@airgap/beacon-sdk';
import { MobileSigningRequest } from '@extension-base/background/types/types';
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
import store from '@/store';
import { MutationTypes as AccountMutationTypes } from '@/store/accounts/mutations';
import { approveSignMobileSignature, subscribeMobileSigningRequests } from '@/extension/messaging';
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
        CHANNEL_CLOSED: {
          handler: defaultEventCallbacks.CHANNEL_CLOSED,
        },
        LOCAL_RATE_LIMIT_REACHED: {
          handler: defaultEventCallbacks.LOCAL_RATE_LIMIT_REACHED,
        },
        UNKNOWN: {
          handler: defaultEventCallbacks.UNKNOWN,
        },
      },
    });

    this.addSubstrateBlockchain();
  }

  private addSubstrateBlockchain() {
    this.app.addBlockchain(new SubstrateBlockchain());
  }

  private getTzip10Link(url: string, payload: string) {
    return `${url}?type=tzip10&data=${payload}`;
  }

  public getAccounts() {
    return this.app.getAccounts();
  }

  public getActiveAccount() {
    return this.app.getActiveAccount();
  }

  public async resetConnection() {
    await this.app.disconnect().then(() => {
      store.commit(AccountMutationTypes.DELETE_QR);
    });
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

  public async onUnknownError(callback: TCallback<undefined>) {
    this.app.subscribeToEvent(BeaconEvent.UNKNOWN, callback);
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

  public async onRawRequest(req: MobileSigningRequest[], onCancel?: (id: string) => void) {
    if (!req.length) return;

    const [
      {
        id,
        request: { data, type },
      },
    ] = req;
    const activeAccount = await this.getActiveAccount();

    if (!activeAccount) throw new Error('Beacon not set up.');

    const prepPayload = {
      accountId: activeAccount.accountIdentifier,
      appMetaData: this.appMetaData,
      blockchainData: {
        mode: 'return',
        payload: {
          data,
          dataType: type,
          isMutable: false,
          type: 'raw',
        },
        scope: SubstratePermissionScope.sign_payload_raw,
        type: SubstrateMessageType.sign_payload_request,
      },
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.BlockchainRequest,
    } as any; /* SubstrateSignPayloadRequest */
    const response = await this.sendRequestRaw(prepPayload);
    // makenTranf

    if (!response || (response.blockchainData as any).signature.length === 0) {
      return onCancel && onCancel(id);
    }

    await approveSignMobileSignature(id, (response.blockchainData as any).signature);
  }

  public subscribeRawRequests(cb?: () => void, onCancel?: (id: string) => void) {
    cb && cb();

    return subscribeMobileSigningRequests((req) => {
      this.onRawRequest(req, onCancel);
    });
  }
}

export const beaconController = new BeaconController();
