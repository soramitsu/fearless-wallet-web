import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkName, WalletEcosystem } from '@/interfaces';
import { normalizeNetworkName } from '@/helpers/networkGroups';
import { ETHEREUM_NETWORKS } from '@/consts/networks';

export const BALANCE_FETCH_TTL_MS = 30_000;

const ETHEREUM_NETWORK_SET = new Set(ETHEREUM_NETWORKS.map((value) => value.toLowerCase()));

export const isEvmBalanceNetwork = (network?: string | null): boolean => {
  if (!network) return false;

  return ETHEREUM_NETWORK_SET.has(network.toLowerCase());
};

export const resolveBalanceAddress = (
  network: NetworkName,
  addresses: { substrate?: string; ethereum?: string }
): string | undefined => {
  const { substrate, ethereum } = addresses;

  return isEvmBalanceNetwork(network) ? ethereum : substrate;
};

export const balanceMatchesNetwork = (balance: BalanceItem, network: NetworkName): boolean =>
  normalizeNetworkName(getBalanceNetworkName(balance)) === normalizeNetworkName(network);

export const findBalanceByNetwork = (
  balances: BalanceItem[] | undefined,
  network: NetworkName
): BalanceItem | undefined => {
  if (!balances) return undefined;

  return balances.find((balance) => balanceMatchesNetwork(balance, network));
};

export const findTokenBalanceByNetwork = (
  token: TokenGroup | undefined,
  network: NetworkName
): BalanceItem | undefined => {
  if (!token) return undefined;

  return findBalanceByNetwork(token.balances, network);
};

type BalanceLookup = {
  shouldThrottleFetch: (options: {
    ecosystem: WalletEcosystem;
    network: string;
    address: string;
    ttl: number;
  }) => boolean;
  markFetch: (ecosystem: WalletEcosystem, network: string, address: string) => void;
  clearFetchCache: (ecosystem: WalletEcosystem, network?: string, address?: string) => void;
};

type FetchThrottleParams = {
  lookup: BalanceLookup;
  ecosystem: WalletEcosystem;
  network: string;
  address: string | undefined;
  ttl?: number;
  force?: boolean;
};

type FetchMarkParams = {
  lookup: BalanceLookup;
  ecosystem: WalletEcosystem;
  network: string;
  address: string | undefined;
};

type FetchClearParams = {
  lookup: BalanceLookup;
  ecosystem: WalletEcosystem;
  network?: string;
  address?: string;
};

export const shouldSkipBalanceFetch = ({
  lookup,
  ecosystem,
  network,
  address,
  ttl = BALANCE_FETCH_TTL_MS,
  force = false,
}: FetchThrottleParams): boolean => {
  if (!address) return true;
  if (force) return false;

  return lookup.shouldThrottleFetch({
    ecosystem,
    network,
    address,
    ttl,
  });
};

export const markBalanceFetch = ({ lookup, ecosystem, network, address }: FetchMarkParams): void => {
  if (!address) return;

  lookup.markFetch(ecosystem, network, address);
};

export const clearBalanceFetchCache = ({ lookup, ecosystem, network, address }: FetchClearParams): void => {
  lookup.clearFetchCache(ecosystem, network, address);
};

export const createNetworkMatcher = (networks?: string[]) => {
  if (!networks || networks.length === 0) {
    return () => true;
  }

  const normalized = new Set(networks.map((network) => normalizeNetworkName(network)));

  return (candidate: string) => normalized.has(normalizeNetworkName(candidate));
};
