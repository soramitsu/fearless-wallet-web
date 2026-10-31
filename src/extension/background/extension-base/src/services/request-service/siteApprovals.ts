/**
 * Substrate and Solana signing requests whose approval the wallet is running. A Solana sign-and-send among them may
 * already be on the network, so closing the page that asked for it does not cancel it.
 */
export const siteApprovalsInProgress = new WeakSet<object>();
