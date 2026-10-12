import { getBytes } from 'ethers';

// JSON-RPC DATA is a sequence of bytes, not UTF-8 text. In particular, invalid
// UTF-8 must never turn into replacement characters or the literal hex string.
export function evmMessageBytes(method: string, params: unknown): Uint8Array {
  if (method !== 'personal_sign' && method !== 'eth_sign') throw new Error('Unsupported EVM message method');
  if (!Array.isArray(params) || params.length !== 2) throw new Error('Invalid EVM message parameters');
  const payload = params[method === 'personal_sign' ? 0 : 1];
  if (typeof payload !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(payload))
    throw new Error('EVM message must contain complete hexadecimal bytes');
  return getBytes(payload);
}
