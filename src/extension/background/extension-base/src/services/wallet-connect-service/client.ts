import WalletConnect from '@walletconnect/sign-client';
import { DEFAULT_WALLET_CONNECT_OPTIONS } from '@extension-base/services/wallet-connect-service/consts';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
import type { SessionTypes } from '@walletconnect/types';

// Both WalletConnect roles in a worker, the wallet (dApps pair with Fearless) and the mobile pairing (Fearless pairs
// with a phone wallet), use one client. The SDK gives every client in a worker the same Core, so a second client
// adds a second engine on the same relay. Both engines handle every message, and the one that does not know a session
// answers its requests with an error before the other can. Each also keeps its own copy of the session, proposal and
// request records under the same storage keys, so whichever writes last drops the other's new sessions.
const clients = new WeakMap<object, Promise<WalletConnect>>();

export function walletConnectClient(state: object): Promise<WalletConnect> {
  let client = clients.get(state);
  if (!client) {
    client = WalletConnect.init({
      ...DEFAULT_WALLET_CONNECT_OPTIONS,
      storage: new WalletConnectStorage(),
      // Fearless owns the approval queue and checks each request's topic/id. The SDK's serial queue can restore an
      // already answered request after a worker ends during response cleanup; it must not block other sessions.
      signConfig: { disableRequestQueue: true },
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
export const isWalletSession = (session: SessionTypes.Struct): boolean =>
  !!session.controller && session.controller === session.self?.publicKey;
