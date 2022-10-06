import { ApiPromise, WsProvider } from '@polkadot/api';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { AugmentedActionContext as Context } from '@/store/networks/types';
import type { Networks, Network, Node } from '@/interfaces';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import { formatBalance } from '@/util/balances';
import { MutationTypes } from '@/store/networks/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { accountController } from '@/controllers/accountController';
import NetworksController from '@/controllers/networksController';
import BaseApi from '@/util/BaseApi';
import { ORML_PALLETS_TYPES, getOptions } from '@/util/assets';
import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';

interface ApiOptions {
  apiRetry: number;
  isReady: boolean;
  connectedNode: string | undefined;
  disconnectedNodes: string[];
}

const connectedHandler = (apiOptions: ApiOptions, { url, name }: Node, context: Context) => {
  const { commit } = context;

  // console.info(`%c connected to${url}`, 'background:green;color:#fff');

  apiOptions.apiRetry = 0;
  apiOptions.connectedNode = url;

  commit(MutationTypes.SET_NETWORK_ACTIVE_NODE, {
    network: networkName,
    name,
    url,
  });
};

const disconnectHandler = (
  apiOptions: ApiOptions,
  url: string,
  provider: WsProvider,
  nodes: Node[],
  context: Context
) => {
  apiOptions.apiRetry += 1;
  apiOptions.connectedNode = undefined;
  apiOptions.isReady = false;

  console.log(`%cDisconnected from ${url} ${apiOptions.apiRetry} times`, 'background:red;color:#fff');

  if (apiOptions.apiRetry === MAX_CONTINUE_RETRY) {
    console.log(`%cStopped using ${url} because max retries`, 'background:orange;color:#fff');

    provider.disconnect();

    apiOptions.disconnectedNodes.push(url);
    apiOptions.apiRetry = 0;

    const nextUrl = nodes.find(({ url }) => !apiOptions.disconnectedNodes.includes(url))?.url;

    if (nextUrl === undefined) return;

    connectToApi(nextUrl, nodes, apiOptions, context); // eslint-disable-line no-use-before-define
  }
};

function connectToApi(node: Node, nodes: Node[], apiOptions: ApiOptions, context: Context) {
  const provider = new WsProvider(url, AUTO_CONNECT_MS);
  const api = new ApiPromise({ provider });

  api.on('connected', () => connectedHandler(apiOptions, node, context));
  api.on('disconnected', () => disconnectHandler(apiOptions, node.url, provider, nodes, context));

  api.connect();

  return { provider, api };
}

function connectToNetworksApi(networks: Networks, context: Context): Networks {
  const autoSelectNodes = accountController.getAutoSelectNodesValue();
  const activeNodes = accountController.getActiveNodes();

  return networks.map((network) => {
    const { name: networkName, nodes } = network;

    const autoSelectNode = autoSelectNodes[networkName] ?? true;
    const nodesList = autoSelectNode ? nodes : [activeNodes[networkName]];
    const node = nodesList[0];

    const apiOptions: ApiOptions = {
      apiRetry: 0,
      isReady: false,
      connectedNode: undefined,
      disconnectedNodes: [],
    };

    const { api, provider } = connectToApi(node, nodesList, apiOptions, context);

    return { ...network, api, provider };
  });
}

function subscribeUtilityAssetsBalances(context: Context, address: string, network: Network) {
  const { name: networkName, parentId, api, assets: networkAssets } = network;
  const networkUtilityAsset = networkAssets.find(
    ({ isUtility, type }) => isUtility && !ORML_PALLETS_TYPES.includes(type as string)
  )!;

  if (!networkUtilityAsset) return;

  const { getters, commit, state } = context;
  const { assetsJson } = state;
  const { assetId, type } = networkUtilityAsset;
  const { precision } = assetsJson.find((asset) => asset.id === assetId)!;

  api!.rx.query.system.account(address).subscribe(async (result) => {
    const data = (result as any).data;
    const balance = formatBalance(data as AccountData, precision);
    const historyForNetwork = getters[NetworksGettersTypes.getHistory](assetId, address, networkName);
    const delay = historyForNetwork ? 45 : 0;

    commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
      walletAddress: address,
      network: networkName,
      assetId,
      balance,
      parentId,
      type,
    });

    NetworksController.loadHistory(networkName, address, assetId, delay);
  });
}

function subscribeOrmlAssetsBalances(context: Context, address: string, network: Network) {
  const { commit, state } = context;
  const { assetsJson } = state;
  const { name: networkName, api, assets: networkAssets, parentId } = network;

  networkAssets.forEach(({ assetId, type }) => {
    if (type === undefined) return;

    const { precision } = assetsJson.find((asset) => asset.id === assetId)!;
    const { symbol } = assetsJson.find(({ id }) => id === assetId)!;
    const options = getOptions(symbol, type, assetId);

    if (symbol === 'csm') return; // TODO: fix

    const isEquilibrium = type === 'equilibrium';
    const equilibriumAsset = BaseApi.getEquilibriumAssetName(symbol);
    const query = api!.rx.query;
    const pallet = isEquilibrium
      ? query.eqBalances.account(address, equilibriumAsset)
      : query.tokens?.accounts(address, options);

    pallet.subscribe(async (data) => {
      const balance = formatBalance(data as any as OrmlAccountData, precision);

      commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
        walletAddress: address,
        network: networkName,
        assetId,
        balance,
        parentId,
        type,
      });
    });
  });
}

async function subscribeAssetsBalances(context: Context, address: string, network: Network) {
  const { api } = network;

  await api!.isReadyOrError;

  subscribeUtilityAssetsBalances(context, address, network);
  subscribeOrmlAssetsBalances(context, address, network);
}

export { connectToApi, connectToNetworksApi, subscribeAssetsBalances };
