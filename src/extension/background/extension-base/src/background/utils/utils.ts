import { NetworkJsonOld } from '../../types';
import { APIItemState, BalanceItem } from '../../api/evm/types/ether';
import { TokenBalance } from '../types/types';
import { MAIN_NETWORKS } from '@/consts/networks';
import { RelayChainName, AssetJson } from '@/interfaces';

export function getMockCurrencies(networks: NetworkJsonOld[], tokens: AssetJson[]) {
  const currencies = networks.reduce<TokenBalance[]>((result, network) => {
    const { assets: networkAssets, name: mainNet, parentId, icon } = network;
    const relayChain = (networks.find(({ chainId }) => chainId === parentId)?.name ?? mainNet) as RelayChainName;

    networkAssets.forEach(({ assetId, purchaseProviders, isUtility, isNative, type }) => {
      const {
        symbol,
        icon: assetIcon,
        displayName: _displayName,
        priceId,
        precision,
        existentialDeposit,
      } = tokens.find(({ id }) => id === assetId)!;
      const displayName = _displayName ?? symbol;
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
          relayChain,
          icon: assetIcon,
          providers: purchaseProviders ?? [],
          balances: [],
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
          type: type ?? 'native',
          decimals: precision,
          icon,
          isNative,
          isUtility,
          id: assetId,
        },
      ];

      // balances.forEach((network) => {
      //   keyring.getAccounts().forEach(({ address }) => {
      //     const isEthereumAccountType = keyring.getPair(address).type === 'ethereum';

      //     if ((isEthereumNetwork && isEthereumAccountType) || (!isEthereumNetwork && !isEthereumAccountType))
      //       network[address] = MOCK_FP_BALANCE;
      //   });
      // });

      result[index].balances = balances;
    });

    return result;
  }, []);

  return currencies;
}
