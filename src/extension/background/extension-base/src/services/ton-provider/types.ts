import type { Address, Cell } from '@ton/core';
import type { TokenRates } from '@ton-api/client';

/** The TON network a provider has proven it serves. */
type TonNetworkKind = 'mainnet' | 'testnet';

/** `ti`: the TONSWAP indexer through its own routes. `registry-node`: the registry's TON node (a TonAPI server). */
type TonProviderSource = 'ti' | 'registry-node';

type TonAccountBalance = {
  /** Nanotons. */
  balance: bigint;
  /** The address has ever held funds or sent a transaction. */
  hasActivity: boolean;
};

type TonJettonHolding = {
  master: Address;
  wallet: Address;
  /** In the jetton's own units. */
  balance: bigint;
  decimals: number;
  symbol: string;
  name: string;
  image: string;
  /** Listed by the provider as a known jetton; only these may be priced. */
  verified: boolean;
  price?: TokenRates;
};

type TonJettonScan = {
  holdings: TonJettonHolding[];
  /** Every jetton the address holds is listed, so a jetton missing from the list has none left. */
  complete: boolean;
};

type TonHistoryJetton = { master: Address; symbol: string };

type TonHistoryAction =
  | {
      type: 'ton-transfer';
      success: boolean;
      /** Nanotons. */
      amount: string;
      sender?: Address;
      recipient?: Address;
      comment?: string;
    }
  | {
      type: 'jetton-transfer';
      success: boolean;
      amount: string;
      sender?: Address;
      recipient?: Address;
      comment?: string;
      jetton: TonHistoryJetton;
    }
  | {
      type: 'jetton-swap';
      success: boolean;
      amountIn: string;
      amountOut: string;
      dex?: string;
      userWallet?: Address;
      jettonIn?: TonHistoryJetton;
      jettonOut?: TonHistoryJetton;
    };

type TonHistoryEvent = {
  eventId: string;
  /** Unix seconds. */
  timestamp: number;
  /** Nanotons, when the provider reports it. */
  fee?: string;
  actions: TonHistoryAction[];
};

type TonWalletState = {
  seqno: number;
  /** The wallet contract is on chain; an undeployed wallet sends its code with its first transfer. */
  deployed: boolean;
};

/** What the extension asks of a TON provider. Each source implements it against its own API. */
interface TonDataProvider {
  readonly source: TonProviderSource;
  readonly baseUrl: string;
  readonly network: TonNetworkKind;
  /** Whether `sendMessage` goes to the network through this provider. */
  readonly canBroadcast: boolean;

  getAccountBalance(address: Address): Promise<TonAccountBalance>;
  getJettonBalances(address: Address, currency: string): Promise<TonJettonScan>;
  getHistory(address: Address, limit: number): Promise<TonHistoryEvent[]>;
  /** Fiat rates by token, or `undefined` when the provider has none. */
  getRates(tokens: string[], currency: string): Promise<Record<string, TokenRates> | undefined>;
  getWalletState(address: Address): Promise<TonWalletState>;
  sendMessage(boc: Cell): Promise<void>;
}

type TonProviderErrorCode =
  /** The provider could not prove it serves the requested network. */
  | 'ton_provider_unverified'
  /** A response named another network than the one requested; it is never shown. */
  | 'ton_provider_network_mismatch'
  /** A response was not in the provider's documented shape. */
  | 'ton_provider_invalid_response'
  /** The provider answered with an error or not at all. */
  | 'ton_provider_request_failed'
  /** Neither TI nor the registry node could be verified for this network. */
  | 'ton_provider_unavailable'
  /** No verified provider accepts transactions for this network. */
  | 'ton_broadcast_unavailable';

class TonProviderError extends Error {
  constructor(
    readonly code: TonProviderErrorCode,
    readonly detail?: string,
    readonly status?: number
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'TonProviderError';
  }
}

export {
  TonProviderError,
  type TonAccountBalance,
  type TonDataProvider,
  type TonHistoryAction,
  type TonHistoryEvent,
  type TonHistoryJetton,
  type TonJettonHolding,
  type TonJettonScan,
  type TonNetworkKind,
  type TonProviderErrorCode,
  type TonProviderSource,
  type TonWalletState,
};
