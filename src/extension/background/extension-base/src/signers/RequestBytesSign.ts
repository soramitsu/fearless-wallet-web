import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import { TypeRegistry } from '@polkadot/types';
import { u8aToHex } from '@polkadot/util';
import { state } from '@extension-base/background/handlers';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { RequestSign } from '@extension-base/background/types/types';

export default class RequestBytesSign implements RequestSign {
  public readonly payload: SignerPayloadRaw;
  public readonly isMobile: boolean;

  constructor(payload: SignerPayloadRaw, isMobile = false) {
    this.payload = payload;
    this.isMobile = isMobile;
  }

  async sign(_registry: TypeRegistry, pair: KeyringPair): Promise<{ signature: HexString }> {
    if (this.isMobile) {
      return state.walletConnectDappService.onRequestRaw(this.payload);
    }

    return {
      signature: u8aToHex(pair.sign(wrapBytes(this.payload.data))),
    };
  }
}
