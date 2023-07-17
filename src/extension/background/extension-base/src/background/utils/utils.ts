import { NetworkJson } from '@extension-base/types';
import { BalanceItem } from '@extension-base/api/evm/types/ether';
import { APIItemState } from '@extension-base/api/types/networks';
import { TokenBalance } from '@extension-base/background/types/types';
import { state } from '@extension-base/background/handlers';
import { keyring } from '@polkadot/ui-keyring';
import { isEthereumAddress } from '@polkadot/util-crypto';
import type { AssetName, NetworkName } from '@/interfaces';
import { MAIN_NETWORKS, ETHEREUM_NETWORKS, SUBSTRATE_ETHEREUM_NETWORKS } from '@/consts/networks';
import { RelayChainName } from '@/interfaces';
import { ETHEREUM_UTILITY_ASSETS } from '@/consts/currencies';

export function getMockCurrencies(networks: NetworkJson[]) {
  const currencies = networks.reduce<TokenBalance[]>((result, network) => {
    const { assets: networkAssets, name: mainNet, parentId, icon: networkIcon } = network;
    const relayChain = (networks.find(({ chainId }) => chainId === parentId)?.name ?? mainNet) as RelayChainName;

    networkAssets.forEach(
      ({
        id: assetId,
        purchaseProviders,
        isUtility,
        isNative,
        type,
        symbol,
        priceId,
        precision,
        existentialDeposit,
        color,
        icon: assetIcon,
        name: tokenName,
        currencyId,
      }) => {
        const mainNetwork = MAIN_NETWORKS[symbol] ?? mainNet;
        const currencyIndex = result.findIndex(({ assetId: _assetId, relayChain: _relayChain, symbol: _symbol }) => {
          const isExistingAssetId = _assetId === assetId;
          const isExistingSymbol = _symbol === symbol;
          const isExistingAsset = isExistingSymbol && _relayChain === relayChain;

          return isExistingAssetId || isExistingAsset;
        });

        if (currencyIndex === -1) {
          const newCurrency = {
            mainNetwork,
            assetId,
            priceId,
            precision,
            symbol,
            tokenName,
            relayChain,
            icon: assetIcon,
            providers: purchaseProviders ?? [],
            balances: [],
            color,
            currencyId,
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
            type,
            precision,
            icon: networkIcon,
            isNative,
            isUtility: isUtility ?? false,
            id: assetId,
            symbol,
          },
        ];

        result[index].balances = balances;
      }
    );

    return result;
  }, []);

  return currencies;
}

export function isEthereumNetwork(network: string) {
  return ETHEREUM_NETWORKS.includes(network.toLowerCase());
}

export function isRequireSubstrateAPI(network: string) {
  return SUBSTRATE_ETHEREUM_NETWORKS.includes(network.toLowerCase());
}

export function getUtilityProps(_network: NetworkName) {
  return state.networksJson.find(({ name }) => name.toLowerCase() === _network.toLowerCase())!.assets[0];
}

export function getNativeAssetName(asset: AssetName) {
  return asset.toLowerCase().replace('xc', '');
}

export function getEthereumAssetName(asset: AssetName, network: NetworkName) {
  const assetLower = asset.toLowerCase();

  return isEthereumNetwork(network) && !Object.values(ETHEREUM_UTILITY_ASSETS).includes(assetLower)
    ? `xc${assetLower}`
    : assetLower;
}

export function getSubstrateAddressByEthAddress(address: string) {
  const accounts = keyring.getAccounts();

  return isEthereumAddress(address)
    ? accounts.find(({ meta: { ethereumAddress } }) => ethereumAddress === address)?.address ?? address
    : address;
}
