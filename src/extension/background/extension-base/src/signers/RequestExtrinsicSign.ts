import { type TypeRegistry } from '@polkadot/types';
import type State from '@extension-base/background/handlers/State';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { RequestSign } from '@extension-base/background/types/types';

export default class RequestExtrinsicSign implements RequestSign {
  constructor(
    public readonly payload: SignerPayloadJSON,
    public readonly state: State,
    private readonly isMobile = false
  ) {}

  async sign(registry: TypeRegistry, pair: KeyringPair): Promise<{ signature: HexString }> {
    if (this.isMobile) return this.state.walletConnectDappService.onRequest(this.payload);

    const signData = registry.createType('ExtrinsicPayload', this.payload, { version: this.payload.version });

    return signData.sign(pair);
  }
}
