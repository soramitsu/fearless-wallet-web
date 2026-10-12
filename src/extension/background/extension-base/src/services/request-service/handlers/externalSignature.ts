import { verifyMessage, verifyTypedData } from 'ethers';
import { Enum } from '@polkadot/types-codec';
import { hexToU8a, u8aEq } from '@polkadot/util';
import { blake2AsU8a, decodeAddress, ed25519Verify, secp256k1Verify, sr25519Verify } from '@polkadot/util-crypto';
import { wrapBytes } from '@polkadot/extension-dapp/wrapBytes';
import { createSubstrateSigningRegistry } from './substrateSigningContext';
import type { SignRequest } from '@extension-base/background/types/types';
import type { EvmRequestPayload } from '@extension-base/services/request-service/types';
import { evmTypedData } from '@/util/evmTypedData';
import { evmMessageBytes } from '@/util/evmMessageBytes';

const invalid = (): never => {
  throw new Error('External signature does not match the reviewed request');
};
function signatureBytes(signature: string): Uint8Array {
  if (typeof signature !== 'string' || !/^0x(?:[0-9a-fA-F]{2}){64,66}$/.test(signature)) return invalid();
  return hexToU8a(signature);
}

export function assertEvmExternalSignature(request: EvmRequestPayload, signature: string): void {
  signatureBytes(signature);
  // A transaction hash cannot attest to the reviewed transaction's fields.
  // Sending remains owned by the ordinary local/mobile approval path.
  if (request.method === 'eth_sendTransaction') throw new Error('External transaction completion is not supported');
  const typed = request.method.startsWith('eth_signTypedData') ? evmTypedData(request.method, request.data) : undefined;
  const signer = typed
    ? verifyTypedData(typed.domain, typed.types, typed.message, signature)
    : verifyMessage(evmMessageBytes(request.method, request.data), signature);
  if (signer.toLowerCase() !== request.account.address.toLowerCase()) invalid();
}

function verifyExact(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array, withType: boolean): boolean {
  const kind = withType ? signature[0] : undefined;
  const bytes = withType ? signature.subarray(1) : signature;
  const candidates = [
    () => (kind === undefined || kind === 0) && bytes.length === 64 && ed25519Verify(message, bytes, publicKey),
    () => (kind === undefined || kind === 1) && bytes.length === 64 && sr25519Verify(message, bytes, publicKey),
    () =>
      (kind === undefined || kind === 2) &&
      bytes.length === 65 &&
      secp256k1Verify(message, bytes, publicKey, publicKey.length === 20 ? 'keccak' : 'blake2'),
  ];
  // signatureVerify deliberately tries wrapped AND unwrapped bytes. Completion
  // must instead verify the exact byte contract used by the queued signer.
  return candidates.some((verify) => {
    try {
      return verify();
    } catch {
      return false;
    }
  });
}

export function assertSubstrateExternalSignature(request: SignRequest, signature: string): void {
  const bytes = signatureBytes(signature);
  const payload = request.request.payload;
  const publicKey = decodeAddress(request.account.address);
  if (!u8aEq(publicKey, decodeAddress(payload.address))) invalid();
  let message: Uint8Array;
  let withType = false;
  if ('genesisHash' in payload) {
    if (payload.version !== 4) throw new Error('External extrinsic version is not supported');
    const registry = createSubstrateSigningRegistry(request.signingContext, payload);
    message = registry.createType('ExtrinsicPayload', payload, { version: payload.version }).toU8a(true);
    if (message.length > 256) message = blake2AsU8a(message);
    withType = registry.createType('ExtrinsicSignature') instanceof Enum;
  } else {
    if (payload.type !== 'bytes' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(payload.data)) invalid();
    message = wrapBytes(payload.data);
  }
  if (!verifyExact(message, bytes, publicKey, withType)) invalid();
}
