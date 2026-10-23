import { APIItemState } from '@extension-base/api/types/networks';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { NetworkEcosystem, NetworkJson } from '@extension-base/types';
import type { RelayChainName } from '@/interfaces';
import { WalletEcosystem } from '@/interfaces';

const isSameEcosystem = (networkEcosystem: NetworkEcosystem, walletEcosystem: WalletEcosystem) => {
  if (walletEcosystem === WalletEcosystem.Ton) return networkEcosystem === WalletEcosystem.Ton;
  if (walletEcosystem === WalletEcosystem.Solana) return networkEcosystem === WalletEcosystem.Solana;
  if (walletEcosystem === WalletEcosystem.Bitcoin) return networkEcosystem === WalletEcosystem.Bitcoin;
  if (walletEcosystem === WalletEcosystem.Iroha) return networkEcosystem === WalletEcosystem.Iroha;

  return (
    networkEcosystem !== WalletEcosystem.Ton &&
    networkEcosystem !== WalletEcosystem.Solana &&
    networkEcosystem !== WalletEcosystem.Bitcoin &&
    networkEcosystem !== WalletEcosystem.Iroha
  );
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
        const balances: BalanceItem[] = [
          {
            state: APIItemState.PENDING,
            name: mainNet.toLowerCase(),
            existentialDeposit,
            type: type ?? tonType,
            precision,
            icon: networkIcon,
            isNative,
            isUtility: isUtility ?? false,
            id: assetId,
            symbol,
            currencyId,
            assetMetadataTrust: 'verified',
            assetMetadataSource: 'registry',
            priceId,
            scanCoverage: 'catalogOnly',
          },
        ];
        result.push({
          mainNetwork: mainNet,
          groupId: assetId,
          priceId,
          symbol,
          tokenName,
          relayChain: prepRelayChain,
          icon: assetIcon,
          providers: purchaseProviders ?? [],
          priceProvider,
          balances,
          color,
        });
      }
    );

    return result;
  }, []);

  return currencies;
}
