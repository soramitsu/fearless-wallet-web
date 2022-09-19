import { ApiPromise, WsProvider } from '@polkadot/api';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { AugmentedActionContext as Context } from '@/store/networks/types';
import type { Networks, DisconnectNetworks } from '@/interfaces/networks';
import { formatBalance } from '@/util/balances';
import { MutationTypes } from '@/store/networks/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { accountController } from '@/controllers/accountController';
import NetworksController from '@/controllers/networksController';

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

function updateCurrencyInfo(context: Context, tokenId: string, precision: number) {
  const { commit, state, rootState } = context;
  const { tokensPriceJson } = state;
  const tokensPrice = tokensPriceJson[tokenId] ?? {};
  const selectedFiat = rootState.account.selectedFiat;

  commit(MutationTypes.UPDATE_CURRENCY, {
    tokenId,
    tokensPrice,
    precision,
    selectedFiat,
  });
}

function subscribeToBalancesUtilityTokens(
  context: Context,
  api: ApiPromise,
  tokenId: string,
  network: string,
  address: string,
  precision: number
) {
  const { getters, commit } = context;

  api.rx.query.system.account(address).subscribe(async (result) => {
    const data = (result as any).data;
    const balance = formatBalance(data as AccountData, precision);
    const historyForNetwork = getters[NetworksGettersTypes.getHistory](network);
    const historyForAddress = historyForNetwork?.[address];
    const delay = historyForAddress ? 45 : 0;

    commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
      walletAddress: address,
      network,
      tokenId,
      balance,
    });

    NetworksController.loadHistory(network, address, delay);
  });
}

function subscribeToBalancesOrmlTokens(
  context: Context,
  api: ApiPromise,
  tokenId: string,
  network: string,
  address: string,
  precision: number
) {
  const { getters, commit } = context;

  api.rx.query.system.account(address).subscribe(async (result) => {
    const data = (result as any).data;
    const balance = formatBalance(data as AccountData, precision);
    const historyForNetwork = getters[NetworksGettersTypes.getHistory](network);
    const historyForAddress = historyForNetwork?.[address];
    const delay = historyForAddress ? 45 : 0;

    commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
      walletAddress: address,
      network,
      tokenId,
      balance,
    });

    NetworksController.loadHistory(network, address, delay);
  });
}

export {
  connectToApi,
  connectToNetworksApi,
  subscribeToBalancesUtilityTokens,
  subscribeToBalancesOrmlTokens,
  updateCurrencyInfo,
};
