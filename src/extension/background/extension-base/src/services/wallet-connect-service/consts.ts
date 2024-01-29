import {
  type WalletConnectSigningMethod,
  POLKADOT_SIGNING_METHODS,
  EIP155_SIGNING_METHODS,
} from '@extension-base/services/wallet-connect-service/types';
import type { CoreTypes, SignClientTypes } from '@walletconnect/types';

export const PROJECT_ID_EXTENSION = '991eb107bbaa66300db0223ec15c48ca';
export const RELAY_URL = 'wss://relay.walletconnect.com';
export const WALLET_CONNECT_METADATA: CoreTypes.Metadata = {
  name: 'Fearless Wallet',
  description:
    'Non-Custodial and Decentralized wallet for the Polkadot and Kusama ecosystems with the best UX, performance and security.',
  url: 'https://fearlesswallet.io/',
  icons: [
    'https://raw.githubusercontent.com/soramitsu/shared-features-utils/ffa1fd2a334530101022536c3b1ab3c063edd238/icons/FW%20icon%20128.png',
  ],
};
export const DEFAULT_WALLET_CONNECT_OPTIONS: SignClientTypes.Options = {
  logger: undefined,
  projectId: PROJECT_ID_EXTENSION,
  relayUrl: RELAY_URL,
  metadata: WALLET_CONNECT_METADATA,
};

export const ALL_WALLET_CONNECT_EVENT: SignClientTypes.Event[] = [
  'session_proposal',
  'session_update',
  'session_extend',
  'session_ping',
  'session_delete',
  'session_expire',
  'session_request',
  'session_request_sent',
  'session_event',
  'proposal_expire',
];

export const WALLET_CONNECT_SUPPORTED_METHODS: WalletConnectSigningMethod[] = [
  POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE,
  POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_TRANSACTION,
  EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION,
  EIP155_SIGNING_METHODS.PERSONAL_SIGN,
  EIP155_SIGNING_METHODS.ETH_SIGN,
  EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA,
  EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V1,
  EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3,
  EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4,
];

export const WALLET_CONNECT_REQUEST_KEY = 'wallet-connect';
export const DEFAULT_LOGGER = 'debug';
export const WALLET_CONNECT_EIP155_NAMESPACE = 'eip155';
export const WALLET_CONNECT_POLKADOT_NAMESPACE = 'polkadot';
export const WALLET_CONNECT_SUPPORT_NAMESPACES: string[] = [
  WALLET_CONNECT_EIP155_NAMESPACE,
  WALLET_CONNECT_POLKADOT_NAMESPACE,
];
export const SUBSTRATE_EVM_HALF_CHAINID = ['fe58ea77779b7abda7da4ec526d14db9', '401a1f9dca3da46f5c4091016c8a2f26'];
