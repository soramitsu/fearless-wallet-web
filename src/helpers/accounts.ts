import type { Wallet } from '@/stores';
import type { ChainAccount } from '@/interfaces';
import type { NetworkJson } from '@/extension/background/extension-base/src/types';
import BaseApi from '@/util/BaseApi';

function getChainAccounts(networks: NetworkJson[], wallet: Wallet): ChainAccount[] {
  return networks.map(({ name, icon }) => {
    return {
      network: name,
      networkIcon: icon,
      address: BaseApi.formatAddress(wallet, name),
    };
  });
}

export { getChainAccounts };
