import { DEFAULT_WALLET_CONNECT_OPTIONS } from '@extension-base/services/wallet-connect-service/consts';
import { WalletConnectClient } from '@extension-base/services/wallet-connect-service/protocol/client';
import { ProtectedStorage } from './protectedStorage';
import type State from '@extension-base/background/handlers/State';
import type { WcSession } from '@extension-base/services/wallet-connect-service/protocol/types';
import { APP_VERSION } from '@/consts/global';

// Both WalletConnect roles in a worker, the wallet (dApps pair with Fearless) and the mobile pairing (Fearless pairs
// with a phone wallet), use one client: one relay connection and one stored record, so neither role can answer the
// other's requests or overwrite its sessions. The client is this repository's own implementation of the protocol
// (protocol/), not the WalletConnect SDK.
type Connection = { pending: Promise<WalletConnectClient>; storage: ProtectedStorage; live?: WalletConnectClient };
const clients = new WeakMap<State, Connection>();

export function closeProtocolClient(state: State) {
  const connection = clients.get(state);
  clients.delete(state);
  connection?.storage.close();
  connection?.live?.close();
}

export function walletConnectClient(state: State): Promise<WalletConnectClient> {
  const existing = clients.get(state);
  if (existing) return existing.pending;
  const revision = state.keyringService?.walletAuthenticationRevision;
  const storage = new ProtectedStorage(() => !state.keyringService.isResetting && revision === state.keyringService.walletAuthenticationRevision
    ? state.keyringService.getPassword() : '');
  const pending = WalletConnectClient.init({
    ...DEFAULT_WALLET_CONNECT_OPTIONS, storage,
    userAgent: `wc-2/fearless-wallet-${APP_VERSION}/browser-extension`,
  }).then(client => {
    if (clients.get(state) !== connection) {
      client.close();
      throw new Error('Wallet authentication changed');
    }
    connection.live = client;
    return client;
  });
  const connection: Connection = { pending, storage };
  clients.set(state, connection);
  pending.catch(() => {
    storage.close();
    if (clients.get(state) === connection) clients.delete(state);
  });
  return pending;
}

/** A session Fearless approved as the wallet, which makes it the controller. In a mobile pairing the phone wallet is. */
export const isWalletSession = (session: WcSession): boolean =>
  !!session.controller && session.controller === session.self?.publicKey;
