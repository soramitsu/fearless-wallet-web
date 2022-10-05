import type { Wallet } from '@/store/accounts/types';
import type { ChainAccount, Networks } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import NetworksController from '@/controllers/networksController';

function getChainAccounts(networks: Networks, wallet: Wallet): ChainAccount[] {
  const assetsJson = NetworksController.getAssetsJson();

  return networks.map(({ name, assets: networkAssets }) => {
    const assetId = networkAssets.find(({ isUtility }) => isUtility)!.assetId;
    const asset = assetsJson.find(({ id }) => id === assetId)!.symbol;
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
      asset,
      address,
      isReplaced: !!replacedAddress,
    };
  });
}

export { getChainAccounts };
