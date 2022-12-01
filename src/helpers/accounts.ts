import type { Wallet, CustomAccounts } from '@/store';
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

    return {
      network: name,
      asset,
      address: BaseApi.formatAddress(finalWallet, name),
      isReplaced: !!replacedAddress,
    };
  });
}

function getAccounts(): CustomAccounts {
  const accounts = BaseApi.getAccounts().reduce((result, { address, meta }) => {
    const { type } = BaseApi.getPair(address);

    result[address] = { type, json: { address, meta } };

    return result;
  }, {} as CustomAccounts);

  const mobileAccount = BaseApi.getMobileAddresses().reduce((result, { address, meta }) => {
    result[address] = { type: undefined, json: { address, meta } };

    return result;
  }, {} as CustomAccounts);

  return { ...accounts, ...mobileAccount };
}

export { getChainAccounts, getAccounts };
