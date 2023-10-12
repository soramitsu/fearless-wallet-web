import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { RequestSign } from '@/extension/background/extension-base/src/background/types';

export default class BeaconSignerJSON implements RequestSign {
  constructor(readonly payload: SignerPayloadJSON, readonly signature: HexString) {}

  sign(): { signature: HexString } {
    return {
      signature: this.signature,
    };
  }
}
