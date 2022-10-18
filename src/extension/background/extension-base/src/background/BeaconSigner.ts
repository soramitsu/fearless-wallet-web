// Copyright 2017-2022 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BeaconMessageType, SubstrateMessageType, SubstratePermissionScope } from '@airgap/beacon-sdk';
import { Signer } from '@polkadot/api/types';
import { SignerPayloadRaw, SignerResult } from '@polkadot/types/types/extrinsic';
import { beaconController } from '@/controllers/beaconController';

export class BeaconSigner implements Signer {
  async signRaw(raw: SignerPayloadRaw): Promise<SignerResult> {
    console.info('SIGN RAW INVOKED', raw);

    const activeAccount = await beaconController.getActiveAccount();

    if (!activeAccount) {
      throw new Error('Beacon not set up.');
    }

    const response = await beaconController.sendRequestRaw(
      {
        accountId: activeAccount.accountIdentifier,
        blockchainData: {
          mode: 'return',
          payload: {
            data: raw.data,
            dataType: raw.type,
            isMutable: false,
            type: 'raw',
          },
          scope: SubstratePermissionScope.sign_payload_raw,
          type: SubstrateMessageType.sign_payload_request,
        },
        blockchainIdentifier: 'substrate',
        type: BeaconMessageType.BlockchainRequest,
      } as any /* SubstrateSignPayloadRequest */
    );

    console.info('RESPONSE', response);

    return {
      id: 0,
      signature: (response.blockchainData as any).signature,
    };
  }
}

export const beaconSigner = new BeaconSigner();
