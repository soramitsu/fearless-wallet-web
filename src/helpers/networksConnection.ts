import { ApiPromise, WsProvider } from '@polkadot/api';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { Network, Node, ApiOptions, AssetJson } from '@/interfaces';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import { formatBalance } from '@/util/balances';
import { MutationTypes } from '@/store/networks/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { accountController } from '@/controllers/accountController';
import NetworksController from '@/controllers/networksController';
import BaseApi from '@/util/BaseApi';
import { ORML_PALLETS_TYPES, getOptions } from '@/util/assets';
import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';
import { getAccounts } from '@/helpers/accounts';
import store from '@/store';

interface ISubscribeData {
  data: AccountData;
}

const connectedHandler = (apiOptions: ApiOptions, { url, name }: Node, network: Network) => {
  const networkName = network.name;

  apiOptions.apiRetry = 0;

  store.commit(MutationTypes.SET_NETWORK_ACTIVE_NODE, {
    network: networkName,
    name,
    url,
  });

  store.commit(MutationTypes.SET_NETWORK_API, {
    network: networkName,
    api: apiOptions.api!,
    provider: apiOptions.provider!,
  });
};

const disconnectHandler = (apiOptions: ApiOptions, network: Network, provider: WsProvider) => {
  apiOptions.apiRetry += 1;

  if (apiOptions.apiRetry === MAX_CONTINUE_RETRY) {
    provider.disconnect();

    apiOptions.apiRetry = 0;
    apiOptions.nodeIndex += 1;
    apiOptions.api = undefined;
    apiOptions.provider = undefined;

    if (navigator.onLine) connectToApi(network, apiOptions); // eslint-disable-line no-use-before-define
  }
};

const readyHandler = (network: Network) => {
  store.dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, {
    accounts: getAccounts(),
    loadHistory: false,
    networksProps: [network],
  });
};

function connectToApi(network: Network, apiOptions: ApiOptions): void {
  const autoSelectNodes = accountController.getAutoSelectNodesValue();
  const activeNodes = accountController.getActiveNodes();
  const { name: networkName, nodes } = network;
  const autoSelectNode = autoSelectNodes[networkName] ?? true;
  const nodesList = autoSelectNode ? nodes : [activeNodes[networkName]];
  const node = nodesList[apiOptions.nodeIndex];

  if (node === undefined) return;

  const provider = new WsProvider(node.url, AUTO_CONNECT_MS);
  const api = new ApiPromise({ provider });

  apiOptions.api = api;
  apiOptions.provider = provider;

  api.on('connected', () => connectedHandler(apiOptions, node, network));
  api.on('disconnected', () => disconnectHandler(apiOptions, network, provider));
  api.on('ready', () => readyHandler(network));
}

function subscribeUtilityAssetsBalances(address: string, { name: networkName, parentId, api, assets }: Network): void {
  const networkUtilityAsset = assets.find(
    ({ isUtility, type }) => isUtility && !ORML_PALLETS_TYPES.includes(type as string)
  )!;

  if (!networkUtilityAsset) return;

  const { assetId, type } = networkUtilityAsset;
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
      type,
    });

    NetworksController.loadHistory(networkName, address, assetId, delay);
  });
}

function subscribeOrmlAssetsBalances(address: string, network: Network): void {
  const { name: networkName, api, assets: networkAssets, parentId } = network;

  networkAssets.forEach(({ assetId, type }) => {
    if (type === undefined) return;

    const { symbol, precision } = (store.getters[NetworksGettersTypes.getAssetsJson] as AssetJson[]).find(
      ({ id }) => id === assetId
    )!;

    if (symbol === 'csm') return; // TODO: fix

    const options = getOptions(symbol, type, assetId);
    const equilibriumAsset = BaseApi.getEquilibriumAssetName(symbol);
    const query = api!.rx.query;
    const pallet =
      type === 'equilibrium'
        ? query.eqBalances.account<OrmlAccountData>(address, equilibriumAsset)
        : query.tokens?.accounts<OrmlAccountData>(address, options);

    pallet.subscribe(async (data) => {
      store.commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
        walletAddress: address,
        network: networkName,
        assetId,
        balance: formatBalance(data, precision),
        parentId,
        type,
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
