import { ApiPromise, WsProvider } from '@polkadot/api';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { AugmentedActionContext as Context } from '@/store/networks/types';
import type { Networks, DisconnectNetworks } from '@/interfaces/networks';
import type { Wallet } from '@/store/accounts/types';
import type { ChainAccount } from '@/interfaces/common';
import { formatBalance } from '@/util/balances';
import { MutationTypes } from '@/store/networks/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { accountController } from '@/controllers/accountController';
import NetworksController from '@/controllers/networksController';
import BaseApi from '@/util/BaseApi';

function connectToApi(name: string, url: string, autoConnectMs = 0) {
  const provider = new WsProvider(url, autoConnectMs);
  const api = new ApiPromise({ provider });

  try {
    api.connect();

    // console.info(`%c${name.toUpperCase()}. API connection successful.`, 'background:green;color:#fff');
  } catch (ex) {
    // api.disconnect();

    console.info(`%c${name.toUpperCase()}. Connection to api failed.`, 'background:red;color:#fff');
  }

  return { provider, api };
}

function connectToNetworksApi(networks: DisconnectNetworks, autoConnectMs: number, context: Context): Networks {
  const { commit } = context;
  const autoSelectNodes = accountController.getAutoSelectNodesValue();
  const activeNodes = accountController.getActiveNodes();

  return networks.map((network) => {
    const { name, nodes } = network;

    const autoSelectNode = autoSelectNodes[name] ?? true;
    const url = autoSelectNode ? nodes[0].url : activeNodes[name].url;
    const nodeName = autoSelectNode ? nodes[0].name : activeNodes[name].name;

    commit(MutationTypes.SET_NETWORK_ACTIVE_NODE, {
      network: name,
      name: nodeName,
      url,
    });

    const { api, provider } = connectToApi(name, url, autoConnectMs);

    return { ...network, api, provider };
  });
}

function subscribeToBalances(context: Context, api: ApiPromise, tokenId: string, network: string, address: string) {
  const { getters, commit, state, rootState } = context;
  const { tokensPriceJson, assets } = state;
  const tokensPrice = tokensPriceJson[tokenId] ?? {};
  const precision = assets.find((asset) => asset.id === tokenId)?.precision ?? 0;
  const selectedFiat = rootState.account.selectedFiat;

  commit(MutationTypes.UPDATE_CURRENCY, {
    tokenId,
    tokensPrice,
    precision,
    selectedFiat,
  });

  api.rx.query.system.account(address).subscribe(async (result) => {
    const data = (result as any).data;
    const balance = formatBalance(data as AccountData, precision);
    const historyForNetwork = getters[NetworksGettersTypes.getHistory](network);
    const historyForAddress = historyForNetwork?.[address];
    const delay = historyForAddress ? 45 : 0;

    const currency = {
      network,
      tokenId,
      balance,
    };

    commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
      walletAddress: address,
      currency,
    });

    NetworksController.loadHistory(network, address, delay);
  });
}

function getChainAccounts(networks: Networks, wallet: Wallet): ChainAccount[] {
  const assets = NetworksController.getAssets();

  return networks.map(({ name, assets: networkAssets }) => {
    const tokenId = networkAssets.find(({ isUtility }) => isUtility)!.assetId; // eslint-disable-line
    const token = assets.find(({ id }) => id === tokenId)!.symbol; // eslint-disable-line
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

export { connectToApi, connectToNetworksApi, subscribeToBalances, getChainAccounts };
