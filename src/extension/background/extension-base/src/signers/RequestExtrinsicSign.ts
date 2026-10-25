import type { TypeRegistry } from '@polkadot/types';
import type { KeyringPair } from '@subwallet/keyring/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { RequestSign } from '@extension-base/background/types/types';

export default class RequestExtrinsicSign implements RequestSign {
  public readonly payload: SignerPayloadJSON;

  constructor(payload: SignerPayloadJSON) {
    this.payload = payload;
  }

  snapshot(): RequestExtrinsicSign {
    return new RequestExtrinsicSign(structuredClone(this.payload));
  }

  async sign(registry: TypeRegistry, pair: KeyringPair): Promise<{ signature: HexString }> {
    const signData = registry.createType('ExtrinsicPayload', this.payload, { version: this.payload.version });

    return signData.sign(pair);
  }
}
