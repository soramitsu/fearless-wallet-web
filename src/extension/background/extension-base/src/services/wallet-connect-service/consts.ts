import {
  type WalletConnectSigningMethod,
  POLKADOT_SIGNING_METHODS,
  EIP155_SIGNING_METHODS,
} from '@extension-base/services/wallet-connect-service/types';
import type { WcMetadata } from '@extension-base/services/wallet-connect-service/protocol/types';

export const PROJECT_ID_EXTENSION = '991eb107bbaa66300db0223ec15c48ca';
export const RELAY_URL = 'wss://relay.walletconnect.com';
export const WALLET_CONNECT_METADATA: WcMetadata = {
  name: 'Fearless Wallet',
  description:
    'Non-Custodial and Decentralized wallet for the Polkadot, Ethereum and TON ecosystems with the best UX, performance and security.',
  url: 'https://fearlesswallet.io/',
  icons: [
    'https://raw.githubusercontent.com/soramitsu/fearless-wallet-web/master/remote-config/production/icons/FW%20icon%20128.png',
  ],
};
export const DEFAULT_WALLET_CONNECT_OPTIONS = {
  projectId: PROJECT_ID_EXTENSION,
  relayUrl: RELAY_URL,
  metadata: WALLET_CONNECT_METADATA,
};

export const WALLET_CONNECT_REQUEST_KEY = 'wallet-connect';
export const WALLET_CONNECT_EIP155_NAMESPACE = 'eip155';
export const WALLET_CONNECT_POLKADOT_NAMESPACE = 'polkadot';

// The methods the wallet answers, by namespace (Eip155Handler and evmSigningAddress; PolkadotHandler). A session lists
// only these, plus any a dApp still sends as required. A dApp's provider sends every listed method to the wallet and
// answers the rest itself or from its node, so an unsupported method listed here would fail where the dApp could have
// answered it: current AppKit dApps ask for 24, such as wallet_getCapabilities, wallet_watchAsset and
// eth_sendRawTransaction.
const WALLET_CONNECT_NAMESPACE_METHODS: Readonly<Record<string, readonly WalletConnectSigningMethod[]>> = {
  [WALLET_CONNECT_EIP155_NAMESPACE]: [
    EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION,
    EIP155_SIGNING_METHODS.PERSONAL_SIGN,
    EIP155_SIGNING_METHODS.ETH_SIGN,
    EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA,
    EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V1,
    EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3,
    EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4,
  ],
  [WALLET_CONNECT_POLKADOT_NAMESPACE]: [
    POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE,
    POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_TRANSACTION,
  ],
};

export const walletConnectNamespaceMethods = (namespace: string): readonly string[] =>
  WALLET_CONNECT_NAMESPACE_METHODS[namespace] ?? [];
export const WALLET_CONNECT_SUPPORT_NAMESPACES: string[] = [
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
];
export const SUBSTRATE_EVM_HALF_CHAIN_IDS = ['fe58ea77779b7abda7da4ec526d14db9', '401a1f9dca3da46f5c4091016c8a2f26'];
