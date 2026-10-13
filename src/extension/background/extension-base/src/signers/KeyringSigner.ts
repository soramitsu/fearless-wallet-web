import {
  captureSubstrateSigningAccount,
  validateSubstrateSigningAccount,
} from '@extension-base/services/request-service/handlers/substrateSigningAccount';
import {
  captureSubstrateSigningContext,
  validateSubstrateSigningContext,
} from '@extension-base/services/request-service/handlers/substrateSigningContext';
import { assertSubstrateExternalSignature } from '@extension-base/services/request-service/handlers/externalSignature';
import { wrapBytes } from '@polkadot/extension-dapp';
import { u8aToHex } from '@polkadot/util';
import { type HexString } from '@polkadot/util/types';
import { state } from '@extension-base/background/handlers';
import RequestExtrinsicSign from './RequestExtrinsicSign';
import type { Registry, SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { Signer, SignerResult } from '@polkadot/api/types';
import type { KeyringPair } from '@subwallet/keyring/types';

interface KeyringSignerProps {
  registry: Registry;
  keyPair: KeyringPair | null;
  isMobile: boolean;
  finalGuard?: () => void;
}

let id = 1;

export default class KeyringSigner implements Signer {
  readonly #pair: KeyringPair | null;
  readonly #registry: Registry;
  readonly #isMobile: boolean;
  readonly #finalGuard?: () => void;

  constructor({ keyPair, registry, isMobile, finalGuard }: KeyringSignerProps) {
    this.#pair = keyPair;
    this.#registry = registry;
    this.#isMobile = isMobile;
    this.#finalGuard = finalGuard;
  }

  public async signPayload(payload: SignerPayloadJSON): Promise<SignerResult> {
    this.#finalGuard?.();
    if (this.#isMobile) {
      const request = new RequestExtrinsicSign(structuredClone(payload));
      const account = { address: request.payload.address, name: '', ethereumAddress: '' };
      const signingAccount = captureSubstrateSigningAccount(state, request, account);
      if (signingAccount.kind !== 'mobile' || !signingAccount.mobileSession)
        throw new Error('Mobile signing account is unavailable');
      const reviewed = {
        request,
        account,
        signingAccount,
        signingContext: captureSubstrateSigningContext(state, state.requestService, request.payload),
      };
      const assertCurrent = () => {
        this.#finalGuard?.();
        validateSubstrateSigningAccount(state, reviewed);
        validateSubstrateSigningContext(state, reviewed);
      };
      const { signature } = await state.walletConnectDappService.onRequest(
        structuredClone(request.payload),
        signingAccount.mobileSession,
        assertCurrent
      );
      assertCurrent();
      assertSubstrateExternalSignature(reviewed, signature);
      return { id: id++, signature };
    }
    if (!this.#pair) throw new Error('unable to find pair');
    const wrapper = this.#registry.createType('ExtrinsicPayload', payload, { version: payload.version });
    return { id: id++, signature: wrapper.sign(this.#pair).signature };
  }

  async sign(payload: SignerPayloadRaw): Promise<{ signature: HexString }> {
    this.#finalGuard?.();
    if (!this.#pair) throw new Error('unable to find pair');

    return {
      signature: u8aToHex(this.#pair.sign(wrapBytes(payload.data))),
    };
  }
}
