import { UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS } from '@/consts/universalWallet';

// Public JSON-RPC nodes tried in order after the user's selected or custom node. Balances, blockhashes,
// simulation and broadcast all come from these; nothing on the send path depends on the si.soramitsu.io indexer.
// PublicNode refuses token-account lookups, which Solana Vibe Station's public node serves (it throttles bursts, so
// it comes after PublicNode and serves little else).
const UNIVERSAL_WALLET_SOLANA_RPC_FAILOVER_ENDPOINTS = {
  mainnet: [
    UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS.mainnet,
    'https://solana-rpc.publicnode.com',
    'https://public.rpc.solanavibestation.com',
    'https://solana.drpc.org',
  ],
  devnet: [UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS.devnet],
} as const;

export { UNIVERSAL_WALLET_SOLANA_RPC_FAILOVER_ENDPOINTS };
