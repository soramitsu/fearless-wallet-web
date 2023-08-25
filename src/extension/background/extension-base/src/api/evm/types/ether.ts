import { APIItemState } from '@extension-base/api/types/networks';
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
  name: string; // is Network Name, TODO name -> networkName
  id: string;
  relayChain?: string;
  existentialDeposit?: string;
  currencyId?: string;
  key?: string;
  precision: number;
  type: AssetType;
  free?: string;
  isUtility?: boolean;
  isNative?: boolean;
  icon?: string; // is network icon
  reserved?: string;
  locked?: string;
  miscFrozen?: string;
  frozen?: string;
  total?: string;
  transferable?: string;
  muchTotal?: string; // only for Sora
  timestamp?: number;
  chain?: string;
  chainHash?: string;
  address?: string;
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

export type NetWorkGroup =
  | 'RELAY_CHAIN'
  | 'POLKADOT_PARACHAIN'
  | 'KUSAMA_PARACHAIN'
  | 'MAIN_NET'
  | 'TEST_NET'
  | 'UNKNOWN';

export type TokenInfo = {
  network: string;
  isMainToken: boolean;
  symbol: string;
  symbolAlt?: string; // Alternate display for symbol
  contractAddress?: string;
  type?: CustomTokenType; // to differentiate custom tokens from native tokens
  decimals: number;
  name: string;
  coinGeckoKey?: string;
  // TODO: unify specialOption, assetId, assetIndex
  specialOption?: object;
  assetId?: string; // for moon assets
  assetIndex?: number | string;
};
