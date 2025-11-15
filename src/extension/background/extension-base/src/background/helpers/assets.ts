import { APIItemState } from '@extension-base/api/types/networks';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { NetworkEcosystem, NetworkJson } from '@extension-base/types';
import type { RelayChainName } from '@/interfaces';
import { WalletEcosystem } from '@/interfaces';
import { MAIN_NETWORKS } from '@/consts/networks';

const isSameEcosystem = (networkEcosystem: NetworkEcosystem, walletEcosystem: WalletEcosystem) => {
  if (walletEcosystem === WalletEcosystem.Ton) return networkEcosystem === WalletEcosystem.Ton;

  return networkEcosystem !== WalletEcosystem.Ton;
};

export function getMockAssets(networkMap: Record<string, NetworkJson>, walletEcosystem: WalletEcosystem) {
  const networks = Object.values(networkMap).filter(({ ecosystem }) => isSameEcosystem(ecosystem, walletEcosystem));

  const currencies = networks.reduce<TokenGroup[]>((result, network) => {
    const { assets: networkAssets, name: mainNet, parentId, icon: networkIcon } = network;
    const relayChain = (networks.find(({ chainId }) => chainId === parentId)?.name ?? mainNet) as RelayChainName;
    const optionEthereum = !!network.options?.some((el) => el === 'ethereum');
    const prepRelayChain = optionEthereum ? 'ethereum' : relayChain;

    networkAssets.forEach(
      ({
        id: assetId,
        purchaseProviders,
        isUtility,
        isNative,
        type,
        tonType,
        symbol,
        priceId,
        precision,
        existentialDeposit,
        color,
        icon: assetIcon,
        name: tokenName,
        currencyId,
        priceProvider,
      }) => {
        const mainNetwork = MAIN_NETWORKS[symbol] ?? mainNet;

        const currencyIndex = result.findIndex(({ groupId, relayChain: _relayChain, symbol: _symbol }) => {
          const isExistingGroupId = groupId === assetId;
          const isExistingSymbol = _symbol === symbol;
          const isExistingAsset = isExistingSymbol && _relayChain === prepRelayChain;

          return isExistingGroupId || isExistingAsset;
        });

        if (currencyIndex === -1) {
          const newCurrency: TokenGroup = {
            mainNetwork,
            groupId: assetId,
            priceId: priceId ?? symbol, // для TON токенов не задан priceId
            symbol,
            tokenName,
            relayChain: prepRelayChain,
            icon: assetIcon,
            providers: purchaseProviders ?? [],
            priceProvider,
            balances: [],
            color,
          };

          result.push(newCurrency);
        } else if (isUtility || isNative) {
          result[currencyIndex].mainNetwork = mainNetwork;
          result[currencyIndex].groupId = assetId;
        }

        // Add mock balances
        const index = currencyIndex === -1 ? result.length - 1 : currencyIndex;
        const balances: BalanceItem[] = [
          ...result[index].balances,
          {
            state: APIItemState.PENDING,
            networkName: mainNet.toLowerCase(),
            existentialDeposit,
            type: type ?? tonType,
            precision,
            icon: networkIcon,
            isNative,
            isUtility: isUtility ?? false,
            id: assetId,
            symbol,
            currencyId,
          },
        ];

        result[index].balances = balances;
      }
    );

    return result;
  }, []);

  return currencies;
}
