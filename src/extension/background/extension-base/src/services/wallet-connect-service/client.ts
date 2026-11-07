import { DEFAULT_WALLET_CONNECT_OPTIONS } from '@extension-base/services/wallet-connect-service/consts';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
import { WalletConnectClient } from '@extension-base/services/wallet-connect-service/protocol/client';
import type { WcSession } from '@extension-base/services/wallet-connect-service/protocol/types';
import { APP_VERSION } from '@/consts/global';

// Both WalletConnect roles in a worker, the wallet (dApps pair with Fearless) and the mobile pairing (Fearless pairs
// with a phone wallet), use one client: one relay connection and one stored record, so neither role can answer the
// other's requests or overwrite its sessions. The client is this repository's own implementation of the protocol
// (protocol/), not the WalletConnect SDK.
const clients = new WeakMap<object, Promise<WalletConnectClient>>();

export function walletConnectClient(state: object): Promise<WalletConnectClient> {
  let client = clients.get(state);
  if (!client) {
    client = WalletConnectClient.init({
      ...DEFAULT_WALLET_CONNECT_OPTIONS,
      storage: new WalletConnectStorage(),
      userAgent: `wc-2/fearless-wallet-${APP_VERSION}/browser-extension`,
    });
    clients.set(state, client);
    // The next caller starts again after a failed start.
    client.catch(() => {
      if (clients.get(state) === client) clients.delete(state);
    });
  }
  return client;
}

/** A session Fearless approved as the wallet, which makes it the controller. In a mobile pairing the phone wallet is. */
export const isWalletSession = (session: WcSession): boolean =>
  !!session.controller && session.controller === session.self?.publicKey;
