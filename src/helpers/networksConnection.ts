import { ApiPromise, WsProvider } from '@polkadot/api';
import { TypeRegistry } from '@polkadot/types/create';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { Network, ApiOptions, AssetJson } from '@/interfaces';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import type { Node } from '@/interfaces/nodes';
import { formatBalance } from '@/util/balances';
import { MutationTypes } from '@/store/networks/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import NetworksController from '@/controllers/networksController';
import { ORML_PALLETS_TYPES, getAssetOptions } from '@/util/assets';
import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';
import { getAccounts } from '@/helpers/accounts';
import store from '@/store';
import { accountController } from '@/controllers/accountController';

interface ISubscribeData {
  data: AccountData;
}

const connectedHandler = (apiOptions: ApiOptions, network: Network) => {
  apiOptions.apiRetry = 0;

  store.commit(MutationTypes.SET_NETWORK_API, {
    network: network.name,
    api: apiOptions.api,
    provider: apiOptions.provider,
  });

  store.commit(MutationTypes.SET_NETWORK_STATUS, {
    network: network.name,
    status: 'connected',
  });
};

const disconnectHandler = (apiOptions: ApiOptions, network: Network, provider: WsProvider, tryAnotherNode: boolean) => {
  apiOptions.apiRetry += 1;

  store.commit(MutationTypes.SET_NETWORK_API, {
    network: network.name,
    api: undefined,
    provider: undefined,
  });

  if (apiOptions.apiRetry >= MAX_CONTINUE_RETRY) {
    provider.disconnect();

    if (tryAnotherNode) {
      apiOptions.apiRetry = 0;
      apiOptions.nodeIndex += 1;
      apiOptions.api = undefined;
      apiOptions.provider = undefined;

      if (navigator.onLine) connectToApi(network, apiOptions); // eslint-disable-line no-use-before-define
    } else
      store.commit(MutationTypes.SET_NETWORK_STATUS, {
        network: network.name,
        status: 'disconnected',
      });
  }
};

const readyHandler = (network: Network) => {
  store.dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, {
    accounts: getAccounts(),
    loadHistory: false,
    networksProps: [network],
  });

  store.commit(MutationTypes.SET_NETWORK_STATUS, {
    network: network.name,
    status: 'ready',
  });
};

function connectToApi(network: Network, apiOptions: ApiOptions, _node?: Node): void {
  const { name: networkName, nodes } = network;
  const activeNodes = accountController.getActiveNodes();
  const autoSelectNode = store.getters.getAutoSelectNodesValueByNetwork(networkName);
  const nodesList = autoSelectNode ? nodes : [activeNodes[networkName]];
  const node = _node ?? nodesList[apiOptions.nodeIndex];
  const registry = new TypeRegistry();

  store.commit(MutationTypes.SET_NETWORK_STATUS, {
    network: networkName,
    status: node === undefined ? 'disconnected' : 'pending',
  });

  if (node === undefined) return;

  store.commit(MutationTypes.SET_ACTIVE_NODE, {
    network: network.name,
    name: node.name,
    url: node.url,
    saveNode: _node !== undefined,
  });

  const provider = new WsProvider(node.url, AUTO_CONNECT_MS);
  const api = new ApiPromise({ provider, registry });

  apiOptions.api = api;
  apiOptions.provider = provider;

  api.on('connected', () => connectedHandler(apiOptions, network));
  api.on('disconnected', () => disconnectHandler(apiOptions, network, provider, _node === undefined));
  api.on('ready', () => readyHandler(network));
}

function subscribeUtilityAssetsBalances(address: string, { name: networkName, parentId, api, assets }: Network): void {
  const networkUtilityAsset = assets.find(
    ({ isUtility, type }) => isUtility && !ORML_PALLETS_TYPES.includes(type as string)
  )!;

  if (!networkUtilityAsset) return;

  const { assetId } = networkUtilityAsset;
  const { precision } = (store.getters[NetworksGettersTypes.getAssetsJson] as AssetJson[]).find(
    ({ id }) => id === assetId
  )!;

  api!.rx.query.system.account<ISubscribeData>(address).subscribe(async ({ data }) => {
    const historyForNetwork = store.getters[NetworksGettersTypes.getHistory](assetId, address, networkName);
    const delay = historyForNetwork ? 45 : 0;

    store.commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
      walletAddress: address,
      network: networkName,
      assetId,
      balance: formatBalance(data, precision),
      parentId,
    });

    NetworksController.loadHistory(networkName, address, assetId, delay);
  });
}

function subscribeOrmlAssetsBalances(address: string, network: Network): void {
  const { name: networkName, api, assets, parentId } = network;

  assets.forEach(({ assetId, type }) => {
    if (type === undefined) return; // is utility Asset

    const { symbol, precision } = (store.getters[NetworksGettersTypes.getAssetsJson] as AssetJson[]).find(
      ({ id }) => id === assetId
    )!;

    if (symbol === 'csm') return; // TODO: fix

    const options = getAssetOptions(symbol, type, assetId);
    const query = api!.rx.query;
    const pallet =
      type === 'equilibrium'
        ? query.eqBalances.account<OrmlAccountData>(address, options)
        : query.tokens?.accounts<OrmlAccountData>(address, options);

    pallet.subscribe(async (data) => {
      store.commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
        walletAddress: address,
        network: networkName,
        assetId,
        balance: formatBalance(data, precision),
        parentId,
      });
    });
  });
}

async function subscribeAssetsBalances(address: string, network: Network): Promise<void> {
  const { api } = network;

  if (api === undefined) return;

  subscribeUtilityAssetsBalances(address, network);
  subscribeOrmlAssetsBalances(address, network);
}

export { connectToApi, subscribeAssetsBalances };
