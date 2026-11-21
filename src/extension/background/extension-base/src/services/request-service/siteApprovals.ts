/**
 * Substrate and Solana signing requests whose approval the wallet is running. A Solana sign-and-send among them may
 * already be on the network, so closing the page that asked for it does not cancel it.
 */
export const siteApprovalsInProgress = new WeakSet<object>();

/**
 * Solana sign-and-send requests whose approval signed the transaction and is sending it. Locking or resetting the
 * wallet leaves them to that approval, which settles them with the signature or its own error.
 */
export const siteTransactionsBeingSent = new WeakSet<object>();
