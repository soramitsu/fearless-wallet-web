import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';

export function resolveCrossChainAssetId(
  originNetwork: NetworkJson | undefined,
  destinationNetwork: NetworkJson | undefined,
  requestedAssetId: string,
  tokenBalance: TokenGroup
): string {
  if (!originNetwork || !destinationNetwork) throw new Error('cross_chain_network_unavailable');
  if (!originNetwork.xcm) throw new Error('cross_chain_provider_unavailable');

  const balance = tokenBalance.balances.find(({ name }) => name.toLowerCase() === originNetwork.name.toLowerCase());
  if (!balance) throw new Error('cross_chain_origin_balance_unavailable');

  const exactIds = new Set(
    [requestedAssetId, balance.id, balance.currencyId].filter((value): value is string => Boolean(value))
  );
  const registryAsset = originNetwork.assets.find(({ id, currencyId }) =>
    [id, currencyId].filter((value): value is string => Boolean(value)).some((value) => exactIds.has(value))
  );

  [registryAsset?.id, registryAsset?.currencyId]
    .filter((value): value is string => Boolean(value))
    .forEach((value) => exactIds.add(value));

  const originAsset = originNetwork.xcm.availableAssets.find(({ id }) => exactIds.has(id));
  if (!originAsset) throw new Error('cross_chain_asset_not_reviewed');

  const destination = originNetwork.xcm.availableDestinations.find(
    ({ chainId }) => String(chainId) === String(destinationNetwork.chainId)
  );
  if (!destination) throw new Error('cross_chain_destination_not_reviewed');

  const destinationAsset = destination.assets.find(({ id }) => id === originAsset.id);
  if (!destinationAsset) throw new Error('cross_chain_asset_not_supported_at_destination');

  return destinationAsset.id;
}
