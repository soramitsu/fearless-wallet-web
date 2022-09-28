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
import keyring from '@polkadot/ui-keyring';
import { getTzip10Link } from './beaconUtils';
import { accountController } from './accountController';
import type { SignerPayloadJSON } from '@polkadot/types/types';

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

  async isBeaconConnected(_address?: string) {
    const beaconAccount = await this.app.getActiveAccount();

    if (beaconAccount && beaconAccount.address) {
      const selectedWallet = accountController.getSelectedWalletAddress(); //change to dynamic address
      const substrateAddress = keyring.encodeAddress(beaconAccount.address, 42);

      return selectedWallet === substrateAddress;
    }

    return false;
  }

  async connect() {
    const config: SubstratePermissionRequest = {
      blockchainData: {
        appMetadata: {
          senderId: 'sender',
          name: 'Fearless Wallet Extension',
          icon: 'data:image/png;base64,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',
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

  async sendRequest(payload: SignerPayloadJSON): Promise<void> {
    console.log('SIGN JSON INVOKED', payload);

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
    const response = await this.app.request(request);

    console.log('RESPONSE', response);
  }
}

export const fearlessConnector = BeaconController.create();
