import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import { type TypeRegistry } from '@polkadot/types';
import { u8aToHex } from '@polkadot/util';
import type { KeyringPair } from '@subwallet/keyring/types';
import type { SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type { RequestSign } from '@extension-base/background/types/types';

export default class RequestBytesSign implements RequestSign {
  constructor(public readonly payload: SignerPayloadRaw) {}

  snapshot(): RequestBytesSign {
    return new RequestBytesSign(structuredClone(this.payload));
  }

  async sign(_registry: TypeRegistry, pair: KeyringPair): Promise<{ signature: HexString }> {
    return {
      signature: u8aToHex(pair.sign(wrapBytes(this.payload.data))),
    };
  }
}
