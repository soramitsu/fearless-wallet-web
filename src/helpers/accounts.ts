import type { Wallet } from '@/stores';
import type { ChainAccount } from '@/interfaces';
import type { NetworkJson } from '@/extension/background/extension-base/src/types';
import BaseApi from '@/util/BaseApi';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

function getChainAccounts(networks: NetworkJson[], wallet: Wallet): ChainAccount[] {
  return networks.map(({ name, icon }) => {
    return {
      network: name,
      networkIcon: icon,
      address: BaseApi.formatAddress(wallet, name),
    };
  });
}

/** Address access is local and does not depend on network activation or balances. */
function getIrohaChainAccounts(networks: NetworkJson[], wallet: Wallet): ChainAccount[] {
  const irohaNetworks = networks.filter(({ ecosystem, chainId }) =>
    ecosystem === 'iroha' && Object.values(UNIVERSAL_WALLET_IROHA_NETWORKS).some((profile) => profile.chainId === chainId)
  );

  return getChainAccounts(irohaNetworks, wallet).filter(({ address, network }) =>
    BaseApi.validateAddress(address, network)
  );
}

export { getChainAccounts, getIrohaChainAccounts };
