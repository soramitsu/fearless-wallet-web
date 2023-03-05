import type { Wallet, CustomAccounts } from '@/store';
import type { ChainAccount, Networks } from '@/interfaces';
import BaseApi from '@/util/BaseApi';

function getChainAccounts(networks: Networks, wallet: Wallet): ChainAccount[] {
  return networks.map(({ name, icon }) => {
    const replacedAccount = BaseApi.getReplacedAccountByNetwork(wallet, name);
    const replacedAddress = replacedAccount?.address;

    const finalWallet: Wallet = replacedAddress
      ? {
          address: replacedAddress,
          ethereumAddress: replacedAddress,
        }
      : wallet;

    return {
      network: name,
      networkIcon: icon,
      address: BaseApi.formatAddress(finalWallet, name),
      isReplaced: !!replacedAddress,
    };
  });
}

export { getChainAccounts };
