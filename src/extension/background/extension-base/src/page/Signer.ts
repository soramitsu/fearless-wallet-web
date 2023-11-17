// Copyright 2019-2022 @polkadot/extension-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { type SendRequest } from '@extension-base/page/types';
import type { Signer as SignerInterface, SignerResult } from '@polkadot/api/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';

// External to class, this.# is not private enough (yet)
let sendRequest: SendRequest;
let nextId = 0;

export default class Signer implements SignerInterface {
  constructor(_sendRequest: SendRequest) {
    sendRequest = _sendRequest;
  }

  public async signPayload(payload: SignerPayloadJSON): Promise<SignerResult> {
    const id = ++nextId;
    const result = await sendRequest('pub(extrinsic.sign)', payload);

    return {
      ...result,
      id,
    };
  }

  public async signRaw(payload: any): Promise<SignerResult> {
    const id = ++nextId;
    const result = await sendRequest('pub(bytes.sign)', payload);

    return {
      ...result,
      id,
    };
  }
}
