/**
 * Whether an address can serve as a Solana JSON-RPC node: https, or plain http on this machine for a local validator.
 * Credentials embedded in the address are refused (a browser will not send them); a provider's key belongs in the
 * path or the query string, which are kept.
 */
export function isUsableSolanaRpcUrl(value: string): boolean {
  try {
    const url = new URL(value);

    if (url.username !== '' || url.password !== '') return false;

    return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}
