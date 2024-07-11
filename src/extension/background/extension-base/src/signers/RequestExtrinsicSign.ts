import { type TypeRegistry } from '@polkadot/types';
import { state } from '@extension-base/background/handlers';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { RequestSign } from '@extension-base/background/types/types';

export default class RequestExtrinsicSign implements RequestSign {
  public readonly payload: SignerPayloadJSON;
  private readonly isMobile: boolean;

  constructor(payload: SignerPayloadJSON, isMobile = false) {
    this.payload = payload;
    this.isMobile = isMobile;
  }

  async sign(registry: TypeRegistry, pair: KeyringPair): Promise<{ signature: HexString }> {
    if (this.isMobile) return state.walletConnectDappService.onRequest(this.payload);

    const signData = registry.createType('ExtrinsicPayload', this.payload, { version: this.payload.version });

    return signData.sign(pair);
  }
}
