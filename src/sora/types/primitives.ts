import type { CodecString } from '@sora/math';

export type Balance = CodecString | number | string;
export type LiquiditySourceType = string;

export type OutcomeFee = Record<string, unknown>;

export type LPSwapOutcomeInfo = {
  amount: Balance;
  fee: OutcomeFee[] | OutcomeFee;
  rewards: Array<Record<string, unknown>>;
  amountWithoutImpact?: Balance;
  route: string[];
};

export type OutgoingRequestEncoded = unknown;
export type SignatureParams = unknown;
export type GenericNetworkId = unknown;
