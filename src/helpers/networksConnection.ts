import { ApiPromise, WsProvider } from '@polkadot/api';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { AugmentedActionContext as Context } from '@/store/networks/types';
import type { Networks, Network } from '@/interfaces';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import { formatBalance } from '@/util/balances';
import { MutationTypes } from '@/store/networks/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { accountController } from '@/controllers/accountController';
import NetworksController from '@/controllers/networksController';
import BaseApi from '@/util/BaseApi';
import { ORML_PALLETS_TYPES, getOptions } from '@/util/assets';

function connectToApi(name: string, url: string, autoConnectMs = 0) {
  const provider = new WsProvider(url, autoConnectMs);
  const api = new ApiPromise({ provider });

  try {
    api.connect();
  } catch (ex) {
    console.info(`%c${name.toUpperCase()}. Connection to api failed.`, 'background:red;color:#fff');
  }

  return { provider, api };
}

function connectToNetworksApi(networks: Networks, context: Context): Networks {
  const autoConnectMs = 0; // fix
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
