// Copyright 2017-2022 @polkadot/react-signer authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { wrapBytes } from '@polkadot/extension-dapp';
import { u8aToHex } from '@polkadot/util';
import { type HexString } from '@polkadot/util/types';
import { state } from '@extension-base/background/handlers';
import type { Registry, SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { Signer, SignerResult } from '@polkadot/api/types';
import type { KeyringPair } from '@subwallet/keyring/types';

interface KeyringSignerProps {
  registry: Registry;
  keyPair: KeyringPair | null;
  isMobile: boolean;
}

let id = 1;

export default class KeyringSigner implements Signer {
  readonly #pair: KeyringPair | null;
  readonly #registry: Registry;
  readonly #isMobile: boolean;

  constructor({ keyPair, registry, isMobile }: KeyringSignerProps) {
    this.#pair = keyPair;
    this.#registry = registry;
    this.#isMobile = isMobile;
  }

  public signPayload(payload: SignerPayloadJSON): Promise<SignerResult> {
    return new Promise((resolve, reject) => {
      const wrapper = this.#registry.createType('ExtrinsicPayload', payload, { version: payload.version });

      if (this.#isMobile) {
        state.walletConnectDappService
          .onRequest(payload)
          .then(({ signature }) => resolve({ id: id++, signature }))
          .catch(() => reject());

        return;
      }

      if (!this.#pair) throw new Error('unable to find pair');

      const signature = wrapper.sign(this.#pair).signature;

      resolve({ id: id++, signature });
    });
  }

  async sign(payload: SignerPayloadRaw): Promise<{ signature: HexString }> {
    if (!this.#pair) throw new Error('unable to find pair');

    return {
      signature: u8aToHex(this.#pair.sign(wrapBytes(payload.data))),
    };
  }
}
