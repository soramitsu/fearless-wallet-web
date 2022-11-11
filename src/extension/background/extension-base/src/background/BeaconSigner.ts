// Copyright 2017-2022 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BeaconMessageType, SubstrateMessageType, SubstratePermissionScope } from '@airgap/beacon-sdk';
import type { Signer } from '@polkadot/api/types';
import type { SignerPayloadRaw, SignerResult } from '@polkadot/types/types/extrinsic';
import { beaconController } from '@/controllers/beaconController';

export class BeaconSigner implements Signer {
  async signRaw(raw: SignerPayloadRaw): Promise<SignerResult> {
    console.info('SIGN RAW INVOKED', raw);

    const activeAccount = await beaconController.getActiveAccount();

    if (!activeAccount) {
      throw new Error('Beacon not set up.');
    }

    const prepPayload = {
      accountId: activeAccount.accountIdentifier,
      appMetaData: beaconController.appMetaData,
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
    } as any; /* SubstrateSignPayloadRequest */

    const response = await beaconController.sendRequestRaw(prepPayload);

    if (!response || (response.blockchainData as any).signature === '') throw new Error('Bad Signature');

    return {
      id: 0,
      signature: (response.blockchainData as any).signature,
    };
  }
}
