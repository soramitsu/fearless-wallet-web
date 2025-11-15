import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { AssetName, NetworkName } from '@/interfaces';
import { ETHEREUM_NETWORKS, NATIVE_ETHEREUM_NETWORKS, SUBSTRATE_ETHEREUM_NETWORKS } from '@/consts/networks';
import { SUBSTRATE_EVM_UTILITY_ASSETS } from '@/consts/currencies';
import { isSameString } from '@/helpers';

export function isEthereumNetwork(network: string) {
  return ETHEREUM_NETWORKS.includes(network.toLowerCase());
}

export function isEthereumSubstrateNetwork(network: string) {
  return SUBSTRATE_ETHEREUM_NETWORKS.includes(network.toLowerCase());
}

export function isNativeEVMNetwork(network: string) {
  return NATIVE_ETHEREUM_NETWORKS.includes(network.toLowerCase());
}

export function getUtilityProps(_network: NetworkName, state: State) {
  return state.networkService.networksGithub.find(({ name }) => isSameString(name, _network))!.assets[0];
}

export function getNativeAssetName(asset: AssetName = '') {
  return asset.toLowerCase().replace('xc', '');
}

export function getBalanceItem(balances: BalanceItem[], network: string) {
  return balances.find((balance) => isSameString(getBalanceNetworkName(balance), network));
}

// For Moonbeam, Moonriver
export function getSubstrateEvmAssetName(asset: AssetName, network: NetworkName) {
  const assetLower = asset.toLowerCase();

  if (!isEthereumSubstrateNetwork(network)) return assetLower;

  if (Object.values(SUBSTRATE_EVM_UTILITY_ASSETS).includes(assetLower)) return assetLower;

  return `xc${assetLower}`;
}

export const uniqueStringArray = (array: string[]): string[] => {
  const map: Record<string, string> = {};

  array.forEach((v) => (map[v] = v));

  return Object.keys(map);
};
