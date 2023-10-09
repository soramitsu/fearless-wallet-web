import State from '@extension-base/background/handlers/State';
import type { Signer } from '@polkadot/api/types';
import type { SignerPayloadRaw, SignerResult } from '@polkadot/types/types/extrinsic';

let nextId = 0;

export class BeaconSigner implements Signer {
  constructor(readonly state: State) {}

  async signRaw(raw: SignerPayloadRaw): Promise<SignerResult> {
    const id = ++nextId;

    const res = await this.state.signMobile(raw);

    if (!res.signature) throw Error('Bad Signature');

    return {
      id,
      signature: res.signature,
    };
  }
}
