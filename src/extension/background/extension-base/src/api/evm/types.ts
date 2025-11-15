import { type APIItemState } from '@extension-base/api/types/networks';
import { type Address } from '@ton/core';
import type { AssetType } from '@/interfaces';

export interface BalanceChildItem {
  reserved: string;
  frozen: string;
  free: string;
  decimals: number;
}

export interface BalanceItem {
  state: APIItemState;
  symbol: string;
  networkName: string;
  id: string;
  relayChain?: string;
  existentialDeposit?: string;
  mainNetwork?: string;
  currencyId?: string;
  key?: string;
  precision: number;
  type: AssetType;
  free?: string;
  isUtility?: boolean;
  isNative?: boolean;
  icon: string; // is network icon
  reserved?: string;
  locked?: string;
  miscFrozen?: string;
  frozen?: string;
  total?: string;
  transferable?: string;
  timestamp?: number;
  chain?: string;
  chainHash?: string;
  address?: string;

  // sora
  muchTotal?: string;

  // ton
  walletAddress?: Address;
  assetIcon?: string;
}

export enum CustomTokenType {
  erc20 = 'erc20',
}

export interface CustomToken {
  // general interface for all kinds of tokens
  chain: string;
  id: string;
  type: CustomTokenType;
  name?: string;
  symbol?: string;
  decimals?: number;
  isCustom?: boolean;
  isDeleted?: boolean;
  image?: string;
}

export interface CustomTokenJson {
  [CustomTokenType.erc20]: CustomToken[];
}

export type TokenInfo = {
  network: string;
  isMainToken: boolean;
  symbol: string;
  symbolAlt?: string; // Alternate display for symbol
  contractAddress?: string;
  type?: CustomTokenType; // to differentiate custom tokens from native tokens
  decimals: number;
  name: string;
  assetId?: string; // for moon assets
  assetIndex?: number | string;
};

export const getBalanceNetworkName = (balance: BalanceItem): string => {
  if (!balance.networkName) {
    const legacyName = (balance as BalanceItem & { name?: string }).name;

    if (legacyName) {
      balance.networkName = legacyName;
    }
  }

  return balance.networkName;
};

export interface EvmSendTransactionParams {
  from: string;
  to?: string;
  value?: string | number;
  gasLimit?: string | number;
  maxPriorityFeePerGas?: string | number;
  maxFeePerGas?: string | number;
  gasPrice?: string | number;
  data?: string;
}
