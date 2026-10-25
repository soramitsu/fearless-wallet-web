import { decodeAddress, isEthereumAddress } from '@polkadot/util-crypto';
import type { ReviewedCrossChainExecution } from '@/cross-chain/reviewedRoutes';

const ZERO_ADDRESS_20 = /^0x0{40}$/i;

function usesAccountKey20(execution: Readonly<ReviewedCrossChainExecution>): boolean {
  return execution.kind === 'relay-native-xcm-v3' && execution.receiverKind === 'AccountKey20';
}

/**
 * Returns the recipient unchanged when it is a well-formed account for the reviewed route and throws
 * `cross_chain_recipient_invalid` otherwise.
 *
 * polkadot-js coerces malformed input instead of rejecting it: an empty string becomes the zero account, a
 * 33-byte key is cut to 32 bytes, and an SS58 string given where a 20-byte account is expected becomes the ASCII
 * bytes of its first 20 characters. A transfer to any of those accounts cannot be recovered, so the signing path
 * must see only exact accounts.
 */
export function assertReviewedRecipient(execution: Readonly<ReviewedCrossChainExecution>, to: unknown): string {
  if (typeof to !== 'string' || to.length === 0 || to !== to.trim()) throw new Error('cross_chain_recipient_invalid');

  if (usesAccountKey20(execution)) {
    // Mixed-case input must carry a valid EIP-55 checksum; all-lowercase or all-uppercase input has none to check.
    if (!isEthereumAddress(to) || ZERO_ADDRESS_20.test(to)) throw new Error('cross_chain_recipient_invalid');

    return to;
  }

  let account: Uint8Array;
  try {
    account = decodeAddress(to);
  } catch {
    throw new Error('cross_chain_recipient_invalid');
  }
  if (account.length !== 32 || account.every((byte) => byte === 0)) throw new Error('cross_chain_recipient_invalid');

  return to;
}
