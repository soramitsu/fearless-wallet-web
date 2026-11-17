import { computed } from 'vue';
import { walletEcosystemOf } from '@extension-base/background/helpers/walletEcosystem';
import { IS_TEST_ONLY } from '@/consts/global';
import { isSameString } from '@/helpers';
import { receiveAddressForNetwork } from '@/helpers/receiveAddress';
import { scopeNetworksToWallet } from '@/portfolio/assetIdentity';
import { isTestnetNetwork } from '@/portfolio/zeroRule';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

export function useReceiveNetworks() {
  const accounts = useAccountsStore();
  const networks = useNetworksStore();

  return computed(() => {
    const wallet = accounts.selectedWallet;
    const account = accounts.accounts.find(({ address }) => address === wallet.address);
    const inScope = scopeNetworksToWallet(account, {
      ...wallet,
      walletEcosystem: walletEcosystemOf(wallet.address, wallet.walletEcosystem),
    });

    return networks.allNetworks.filter((network) => {
      if (network.disabled || !inScope(network)) return false;
      if (isTestnetNetwork(network) && !IS_TEST_ONLY && !accounts.portfolioView.showTestnets &&
        !isSameString(network.name, accounts.selectedNetwork)) return false;

      return Boolean(receiveAddressForNetwork(wallet, account, network));
    }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
  });
}
