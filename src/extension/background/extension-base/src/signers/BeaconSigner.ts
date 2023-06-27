// Copyright 2017-2022 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { state } from '../background/handlers';
import type { Signer } from '@polkadot/api/types';
import type { SignerPayloadRaw, SignerResult } from '@polkadot/types/types/extrinsic';
let nextId = 0;

export class BeaconSigner implements Signer {
  async signRaw(raw: SignerPayloadRaw): Promise<SignerResult> {
    const id = ++nextId;

    const res = await state.signMobile(raw);

    if (!res.signature) throw Error('Bad Signature');

    return {
      id,
      signature: res.signature,
    };
  }
}
