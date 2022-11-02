// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import State from './handlers/State';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { RequestSign } from './types';

export default class BeaconSignerJSON implements RequestSign {
  public readonly payload: SignerPayloadJSON;

  constructor(payload: SignerPayloadJSON) {
    this.payload = payload;
  }

  sign(): { signature: HexString } {
    return { signature: State.signature as HexString };
  }
}
