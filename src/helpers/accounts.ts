import type { Wallet } from '@/store/accounts/types';
import type { ChainAccount } from '@/interfaces/common';
import type { Networks } from '@/interfaces/networks';
import BaseApi from '@/util/BaseApi';
import NetworksController from '@/controllers/networksController';

function getChainAccounts(networks: Networks, wallet: Wallet): ChainAccount[] {
  const assetsJson = NetworksController.getAssetsJson();

  return networks.map(({ name, assets: networkAssets }) => {
    const tokenId = networkAssets.find(({ isUtility }) => isUtility)!.assetId;
    const token = assetsJson.find(({ id }) => id === tokenId)!.symbol;
    const replacedAccount = BaseApi.getReplacedAccountByNetwork(wallet, name);
    const replacedAddress = replacedAccount?.address;

    const finalWallet: Wallet = replacedAddress
      ? {
          address: replacedAddress,
          ethereumAddress: replacedAddress,
        }
      : wallet;

    const address = BaseApi.formatAddress(finalWallet, name);

    return {
      network: name,
      token,
      address,
      isReplaced: !!replacedAddress,
    };
  });
}

export { getChainAccounts };
