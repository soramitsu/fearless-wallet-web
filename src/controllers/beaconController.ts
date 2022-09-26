import {
  AppMetadata,
  BeaconMessageType,
  DAppClient,
  PermissionRequestV3,
  SubstrateBlockchain,
  SubstrateMessageType,
  SubstratePermissionScope,
  BlockchainRequestV3,
  getDAppClientInstance,
  BeaconEvent,
  defaultEventCallbacks,
  Serializer,
} from '@airgap/beacon-sdk';
import { SignerPayloadRaw } from '@polkadot/types/types/extrinsic';
import { getTzip10Link } from './beaconUtils';

export interface SubstratePermissionRequest extends PermissionRequestV3<'substrate'> {
  blockchainData: {
    scopes: SubstratePermissionScope[]; // enum
    appMetadata: AppMetadata;
    network?: {
      genesisHash: string; // Wallet shows only those accounts
      rpc?: string; // For development nodes?
    }[]; // Array to "whitelist" certain networks? (optional)
  };
}

export interface SubstrateSignPayloadRequest extends BlockchainRequestV3<string> {
  blockchainData: {
    type: SubstrateMessageType.sign_payload_request;
    scope: SubstratePermissionScope.sign_payload_json;
    payload: SignerPayloadRaw;
    mode: 'submit' | 'submit-and-return' | 'return';
  };
}

class BeaconController {
  private readonly app: DAppClient;
  private static serializer = new Serializer();
  constructor() {
    this.app = getDAppClientInstance({
      name: 'Fearless Wallet Extension',
      disableDefaultEvents: true, // Disable all events / UI. This also disables the pairing alert.
      eventHandlers: {
        // To keep the pairing alert, we have to add the following default event handlers back

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

    this.app.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SENT, (data) => {
      console.log('permission', data);
    });

    this.app.subscribeToEvent(BeaconEvent.PAIR_INIT, (data) => {
      console.log('pair init', data);
    });

    const substrateBlockchain = new SubstrateBlockchain();
    this.app.addBlockchain(substrateBlockchain);
  }

  static create() {
    return new BeaconController();
  }

  async connect() {
    const activeAccount = await this.app.getActiveAccount();
    console.log(this.app.getActiveAccount(), 'active account from beacon');

    const response = await this.app.permissionRequest({
      blockchainData: {
        appMetadata: {
          name: 'Fearless Wallet Extension',
        },
        networks: [{ genesisHash: '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3' }],
        scopes: ['transfer'],
      },
      blockchainIdentifier: 'substrate',
      type: BeaconMessageType.PermissionRequest,
    } as any);

    console.log('response:', response);
  }

  isConnected() {
    return this.app.connectionStatus;
  }

  get account() {
    return this.app.getActiveAccount();
  }

  async onPairingRequest(callback: (payload: string) => void) {
    this.app.subscribeToEvent(BeaconEvent.PAIR_INIT, async (data) => {
      const code = await BeaconController.serializer.serialize(await data.p2pPeerInfo());
      const uri = getTzip10Link('tezos://', code);

      callback(uri);
    });
  }
}

export const fearlessConnector = BeaconController.create();
