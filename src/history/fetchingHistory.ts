import type { NetworkJson } from '@extension-base/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { HistoryFetchRequest, HistoryServiceType } from '@/interfaces';
import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import { isSora } from '@/helpers';
import { balanceMatchesNetwork, findBalanceByNetwork } from '@/helpers/balances';

export type HistoryEndpointConfig = {
  type: HistoryServiceType;
  url: string;
};

type WalletAddressPayload = HistoryFetchRequest['address'];

type HistoryRequestBuilderParams = {
  network: NetworkJson;
  assetId: string;
  wallet: WalletAddressPayload;
  balances: TokenGroup[];
  endpoint: HistoryEndpointConfig;
};

export const getHistoryEndpoint = (network: NetworkJson): HistoryEndpointConfig | null => {
  const { externalApi } = network;
  const historyEndpoint = externalApi?.history;
  const stakingEndpoint = externalApi?.staking;

  if (!historyEndpoint && !stakingEndpoint) return null;

  const shouldPreferStaking = stakingEndpoint?.type?.toLowerCase().startsWith('staking');
  const target = shouldPreferStaking ? (stakingEndpoint ?? historyEndpoint) : (historyEndpoint ?? stakingEndpoint);

  if (!target) return null;

  return {
    type: target.type as HistoryServiceType,
    url: target.url,
  };
};

const findNativeAsset = (balances: TokenGroup[], assetId: string, networkName: string) =>
  balances.find(({ balances }) =>
    balances.some((balance) => balance.id === assetId && balanceMatchesNetwork(balance, networkName))
  );

const findUtilityAsset = (balances: TokenGroup[], networkName: string) =>
  balances.find(({ balances }) =>
    balances.some((balance) => balance.isUtility && balanceMatchesNetwork(balance, networkName))
  );

export const buildHistoryFetchRequest = ({
  network,
  assetId,
  wallet,
  balances,
  endpoint,
}: HistoryRequestBuilderParams): HistoryFetchRequest | null => {
  const networkName = network.name;
  const isNativeEvm = isNativeEVMNetwork(networkName);
  const assetGroup = isNativeEvm
    ? findNativeAsset(balances, assetId, networkName)
    : findUtilityAsset(balances, networkName);

  if (!assetGroup) return null;

  const searchedAsset = findBalanceByNetwork(assetGroup.balances, networkName);

  if (!searchedAsset) return null;

  const isUtility = isNativeEvm ? !!searchedAsset.isUtility : assetId === assetGroup.groupId;

  if (!isSora(networkName) && !isUtility && endpoint.type !== 'etherscan') return null;

  return {
    network: networkName,
    endpoint,
    address: wallet,
    asset: {
      id: searchedAsset.id,
      isUtility,
      contractAddress: !isUtility && endpoint.type === 'etherscan' ? searchedAsset.id : undefined,
    },
  };
};
