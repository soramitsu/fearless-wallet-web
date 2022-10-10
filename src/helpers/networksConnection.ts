import { ApiPromise, WsProvider } from '@polkadot/api';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { AugmentedActionContext as Context, Accounts } from '@/store/networks/types';
import type { Network, Node, ApiOptions } from '@/interfaces';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import { formatBalance } from '@/util/balances';
import { MutationTypes } from '@/store/networks/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { accountController } from '@/controllers/accountController';
import NetworksController from '@/controllers/networksController';
import BaseApi from '@/util/BaseApi';
import { ORML_PALLETS_TYPES, getOptions } from '@/util/assets';
import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { getAccounts } from '@/helpers/accounts';

const connectedHandler = (context: Context, apiOptions: ApiOptions, { url, name }: Node, network: Network) => {
  const { commit } = context;
  const networkName = network.name;

  console.info(`%c connected to ${url}`, 'background:#77dd77;color:#fff');

  apiOptions.apiRetry = 0;

  commit(MutationTypes.SET_NETWORK_ACTIVE_NODE, {
    network: networkName,
    name,
    url,
  });

  commit(MutationTypes.SET_NETWORK_API, {
    network: networkName,
    api: apiOptions.api!,
    provider: apiOptions.provider!,
  });
};

const disconnectHandler = (
  context: Context,
  apiOptions: ApiOptions,
  { url }: Node,
  network: Network,
  provider: WsProvider
) => {
  apiOptions.apiRetry += 1;

  if (apiOptions.apiRetry === MAX_CONTINUE_RETRY) {
    console.info(`%cStopped using ${url} because max retries`, 'background:red;color:#fff');

    provider.disconnect();

    apiOptions.apiRetry = 0;
    apiOptions.nodeIndex += 1;
    apiOptions.api = undefined;
    apiOptions.provider = undefined;

    connectToApi(context, network, apiOptions); // eslint-disable-line no-use-before-define
  } else {
    console.info(`%cDisconnected from ${url} ${apiOptions.apiRetry} times`, 'background:orange;color:#fff');
  }
};

const readyHandler = (context: Context, { url }: Node, network: Network, accounts: Accounts) => {
  const { dispatch } = context;

  console.info(`%c API ready ${url}`, 'background:green;color:#fff');

  dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, { accounts, loadHistory: false, networksProps: [network] });
};

function connectToApi(context: Context, network: Network, apiOptions: ApiOptions): void {
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

  api.on('connected', () => connectedHandler(context, apiOptions, node, network));
  api.on('disconnected', () => disconnectHandler(context, apiOptions, node, network, provider));
  api.on('ready', () => readyHandler(context, node, network, getAccounts()));
}

function subscribeUtilityAssetsBalances(context: Context, address: string, network: Network): void {
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

function subscribeOrmlAssetsBalances(context: Context, address: string, network: Network): void {
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

async function subscribeAssetsBalances(context: Context, address: string, network: Network): Promise<void> {
  const { api } = network;

  if (api === undefined) return;

  await api.isReadyOrError; // NOTE: now this is not necessary, since this function is called when the api is ready

  subscribeUtilityAssetsBalances(context, address, network);
  subscribeOrmlAssetsBalances(context, address, network);
}

export { connectToApi, subscribeAssetsBalances };
