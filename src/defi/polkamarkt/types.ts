export type PolkamarktOutcome = 'Yes' | 'No';
export type PolkamarktTradeMode = 'buy' | 'sell';
export type PolkamarktDisplayStatus = 'open' | 'closed' | 'resolved' | 'cancelled' | 'locked';

export interface PolkamarktMarket {
  id: string;
  conditionId?: string;
  creator?: string;
  title: string;
  description: string;
  category: string;
  oracle?: string;
  resolutionSource?: string;
  closeBlock?: string;
  status?: string;
  mechanism?: string;
  collateralAsset?: string;
  liquidityUsd: string;
  volumeUsd: string;
  probability: string | null;
  displayStatus: PolkamarktDisplayStatus;
  runtimeOnly: boolean;
}

export interface PolkamarktHistoryPoint {
  id: string;
  marketId: string;
  timestamp?: string;
  blockHeight?: string;
  probability: string;
  priceYes?: string;
  priceNo?: string;
  liquidityUsd?: string;
  volumeUsd?: string;
  status?: string;
}

export interface PolkamarktPosition {
  id: string;
  marketId: string;
  marketTitle?: string;
  outcome?: 'YES' | 'NO';
  shares?: string;
  yesShares?: string;
  noShares?: string;
  netCollateralPaid?: string;
  claimablePayout?: string;
  isCreator: boolean;
  status?: string;
  updatedAt?: string;
}

export interface PolkamarktTrade {
  id: string;
  marketId: string;
  side?: 'buy' | 'sell' | 'claim';
  outcome?: 'YES' | 'NO';
  collateral?: string;
  sharesIn?: string;
  sharesOut?: string;
  fee?: string;
  timestamp?: string;
  blockNumber?: string;
  extrinsicHash?: string;
}

export interface PolkamarktClaimable {
  marketId: string;
  account: string;
  status: string;
  resolutionOutcome?: PolkamarktOutcome;
  yesShares: string;
  noShares: string;
  netCollateralPaid: string;
  traderPayout: string;
  claimablePayout?: string;
  creatorFees: string;
  isCreator: boolean;
}

export interface PolkamarktRuntimeCapabilities {
  browse: boolean;
  quoteBuy: boolean;
  quoteSell: boolean;
  marketState: boolean;
  buy: boolean;
  sell: boolean;
  claimMarket: boolean;
  claimCreatorFees: boolean;
  reasons: string[];
}

export interface PolkamarktAccountCapability {
  address: string | null;
  signable: boolean;
  hasKusd: boolean;
  hasXorForFees: boolean;
  reason?: string;
}

export interface PolkamarktSnapshot {
  network: 'SORA Mainnet';
  collateral: 'KUSD';
  feeAsset: 'XOR';
  currentBlock: string;
  markets: PolkamarktMarket[];
  history: PolkamarktHistoryPoint[];
  positions: PolkamarktPosition[];
  trades: PolkamarktTrade[];
  claimable: PolkamarktClaimable[];
  capabilities: PolkamarktRuntimeCapabilities;
  account: PolkamarktAccountCapability;
  indexerStale: boolean;
  warnings: string[];
}

export interface PolkamarktQuoteRequest {
  marketId: string;
  mode: PolkamarktTradeMode;
  outcome: PolkamarktOutcome;
  amount: string;
}

export interface PolkamarktQuote {
  marketId: string;
  mode: PolkamarktTradeMode;
  outcome: PolkamarktOutcome;
  amount: string;
  feeAmount: string;
  networkFee: string;
  resultAmount: string;
  minimumResult: string;
}

export type PolkamarktMutationRequest =
  | (PolkamarktQuoteRequest & { action: 'buy' | 'sell'; minimumResult: string; disclaimerAccepted: boolean })
  | { action: 'claimMarket' | 'claimCreatorFees'; marketId: string; disclaimerAccepted: boolean };

export interface PolkamarktMutationResponse {
  status: boolean;
  hash?: string;
  error?: string;
}
