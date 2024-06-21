import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import { type TypeRegistry } from '@polkadot/types';
import { u8aToHex } from '@polkadot/util';
import type State from '@extension-base/background/handlers/State';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { RequestSign } from '@extension-base/background/types/types';

export default class RequestBytesSign implements RequestSign {
  constructor(
    public readonly payload: SignerPayloadRaw,
    public readonly state: State,
    private readonly isMobile = false
  ) {}

  async sign(_registry: TypeRegistry, pair: KeyringPair): Promise<{ signature: HexString }> {
    if (this.isMobile) return this.state.walletConnectDappService.onRequestRaw(this.payload);

    return {
      signature: u8aToHex(pair.sign(wrapBytes(this.payload.data))),
    };
  }
}
