import { ApiPromise, WsProvider } from '@polkadot/api';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type {
  ExternalApi,
  Networks,
  DisconnectNetworks,
  AugmentedActionContext as Context,
} from '@/store/networks/types';
import { formatBalance } from '@/util/balances';
import BaseApi from '@/util/BaseApi';
import { MutationTypes } from '@/store/networks/mutations';
import { ActionTypes } from '@/store/networks/actions';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { accountController } from '@/controllers/accountController';

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

async function saveHistory(address: string, network: string, api: ExternalApi, context: Context) {
  const { commit, dispatch } = context;
  const formattedAddress = BaseApi.formatAddress({ address, ethereumAddress: address }, network);

  const history = await dispatch(ActionTypes.LOAD_HISTORY, {
    historyExternalApi: api.history,
    walletAddress: formattedAddress,
  });

  commit(MutationTypes.SET_HISTORY, {
    networkName: network,
    walletAddress: address,
    history,
  });
}

function subscribeToBalances(context: Context, api: ApiPromise, token: string, network: string, address: string) {
  const { getters, commit, state, rootState } = context;
  const { tokensPriceJson } = state;
  const tokensPrice = tokensPriceJson[token] ?? {};
  const precision = getters[NetworksGettersTypes.getAssets].find((kek: any) => kek.id === token)?.precision ?? 0;
  const selectedFiat = rootState.account.selectedFiat;

  commit(MutationTypes.UPDATE_CURRENCY, {
    token,
    tokensPrice,
    precision,
    selectedFiat,
  });

  api.rx.query.system.account(address).subscribe(async (result) => {
    const data = (result as any).data;
    const balance = formatBalance(data as AccountData, precision);

    const currency = {
      network,
      token,
      balance,
    };

    commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
      walletAddress: address,
      currency,
    });
  });
}

export { connectToApi, connectToNetworksApi, saveHistory, subscribeToBalances };
