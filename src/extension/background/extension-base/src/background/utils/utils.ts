import { NetworkJsonOld } from '@extension-base/types';
import { BalanceItem } from '@extension-base/api/evm/types/ether';
import { APIItemState } from '@extension-base/api/types/networks';
import { TokenBalance } from '@extension-base/background/types/types';
import { MAIN_NETWORKS, ETHEREUM_NETWORKS, SORA_UTILITY_ASSET } from '@/consts/networks';
import { RelayChainName, AssetJson } from '@/interfaces';

export function getMockCurrencies(networks: NetworkJsonOld[], tokens: AssetJson[]) {
  const currencies = networks.reduce<TokenBalance[]>((result, network) => {
    const { assets: networkAssets, name: mainNet, parentId, icon } = network;
    const relayChain = (networks.find(({ chainId }) => chainId === parentId)?.name ?? mainNet) as RelayChainName;

    networkAssets.forEach(({ assetId, purchaseProviders, isUtility, isNative, type }) => {
      const {
        symbol,
        icon: assetIcon,
        name: tokenName,
        displayName: _displayName,
        priceId,
        precision,
        existentialDeposit,
        color,
      } = tokens.find(({ id }) => id === assetId)!;
      const displayName = _displayName ?? symbol;
      const isXOR = displayName === SORA_UTILITY_ASSET;

      const mainNetwork = MAIN_NETWORKS[displayName] ?? mainNet;
      const currencyIndex = result.findIndex(({ assetId: _assetId, relayChain: _relayChain, name: _displayName }) => {
        const isExistingAssetId = _assetId === assetId;
        const isExistingDisplayName = _displayName === displayName;
        const isExistingAsset = isExistingDisplayName && _relayChain === relayChain;

        return isExistingAssetId || isExistingAsset;
      });

      if (currencyIndex === -1) {
        const newCurrency = {
          mainNetwork,
          assetId,
          priceId,
          precision,
          symbol,
          name: displayName,
          tokenName,
          relayChain,
          icon: assetIcon,
          providers: purchaseProviders ?? [],
          balances: [],
          color,
        };

        result.push(newCurrency);
      } else if (isUtility || isNative) {
        result[currencyIndex].mainNetwork = mainNetwork;
        result[currencyIndex].assetId = assetId;
      }

      // Add mock balances
      const index = currencyIndex === -1 ? result.length - 1 : currencyIndex;
      const balances: BalanceItem[] = [
        ...result[index].balances,
        {
          state: APIItemState.PENDING,
          name: mainNet,
          existentialDeposit,
          type: type ? type : isXOR ? 'soraAsset' : 'native',
          decimals: precision,
          icon,
          isNative,
          isUtility: isUtility ?? false,
          id: assetId,
        },
      ];

      result[index].balances = balances;
    });

    return result;
  }, []);

  return currencies;
}

export function isEthereumNetwork(network: string) {
  return ETHEREUM_NETWORKS.includes(network.toLowerCase());
}
