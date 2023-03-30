// import { ApiPromise, WsProvider } from '@polkadot/api';
// import { connection as soraConnection } from '@sora-substrate/util';
import { WsProvider } from '@polkadot/rpc-provider';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { Network, ApiOptions, AssetJson, NetworkAssetsType } from '@/interfaces';
import type { Node } from '@/interfaces/nodes';
// import type { ProviderInterfaceEmitCb } from '@polkadot/rpc-provider/types';
// import { formatBalance } from '@/util/balances';
// import { MutationTypes } from '@/store/networks/mutations';
// import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
// import { getAssetOptions } from '@/util/assets';
// import { AUTO_CONNECT_MS, MAX_CONTINUE_RETRY } from '@/consts/networks';
// import store from '@/store';
// import { accountController, NetworksController } from '@/controllers';
// import { isSora } from '@/helpers/common';

interface ISubscribeData {
  data: AccountData;
}

const connectedHandler = (apiOptions: ApiOptions, network: Network) => {
  // const api = isSora(network.name) ? soraConnection.api : apiOptions.api;
  // store.commit(MutationTypes.SET_NETWORK_API, {
  //   network: network.name,
  //   api,
  //   provider: apiOptions.provider,
  // });
  // store.commit(MutationTypes.SET_NETWORK_STATUS, {
  //   network: network.name,
  //   status: 'connected',
  // });
};

const disconnectHandler = (
  apiOptions: ApiOptions,
  network: Network,
  tryAnotherNode: boolean,
  currentProvider?: WsProvider
) => {
  // apiOptions.apiRetry += 1;
  // store.commit(MutationTypes.SET_NETWORK_API, {
  //   network: network.name,
  //   api: undefined,
  //   provider: undefined,
  // });
  // if (apiOptions.apiRetry >= MAX_CONTINUE_RETRY) {
  //   currentProvider?.disconnect();
  //   if (tryAnotherNode) {
  //     apiOptions.apiRetry = 0;
  //     apiOptions.nodeIndex += 1;
  //     apiOptions.api = undefined;
  //     apiOptions.provider = undefined;
  //     if (navigator.onLine) connectToApi(network, apiOptions); // eslint-disable-line no-use-before-define
  //   } else
  //     store.commit(MutationTypes.SET_NETWORK_STATUS, {
  //       network: network.name,
  //       status: 'disconnected',
  //     });
  // }
};

const readyHandler = (network: Network) => {
  // store.dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, {
  //   accounts: store.getters.getAccounts,
  //   loadHistory: false,
  //   networksProps: [network],
  // });
  //   store.commit(MutationTypes.SET_NETWORK_STATUS, {
  //     network: network.name,
  //     status: 'ready',
  //   });
};

async function connectToApi(network: Network, apiOptions: ApiOptions, _node?: Node): Promise<void> {
  // const { name: networkName, nodes } = network;
  // const activeNodes = accountController.getActiveNodes();
  // const autoSelectNode = store.getters.getAutoSelectNodesValueByNetwork(networkName);
  // const nodesList = autoSelectNode ? nodes : [activeNodes[networkName]];
  // const node = _node ?? nodesList[apiOptions.nodeIndex];
  // const eventListeners: Array<['connected' | 'disconnected' | 'ready', ProviderInterfaceEmitCb]> = [
  //   ['connected', () => connectedHandler(apiOptions, network)],
  //   ['ready', () => readyHandler(network)],
  // ];
  // store.commit(MutationTypes.SET_NETWORK_STATUS, {
  //   network: networkName,
  //   status: node === undefined ? 'disconnected' : 'pending',
  // });
  // if (node === undefined) return;
  // store.commit(MutationTypes.SET_ACTIVE_NODE, {
  //   network: network.name,
  //   name: node.name,
  //   url: node.url,
  //   saveNode: _node !== undefined,
  // });
  // if (isSora(network.name)) {
  //   eventListeners.push(['disconnected', () => disconnectHandler(apiOptions, network, _node === undefined)]);
  //   await soraConnection.open(node.url, {
  //     autoConnectMs: AUTO_CONNECT_MS,
  //     eventListeners,
  //   });
  // } else {
  //   const provider = new WsProvider(node.url, AUTO_CONNECT_MS);
  //   const api = new ApiPromise({ provider, noInitWarn: true });
  //   apiOptions.api = api;
  //   apiOptions.provider = provider;
  //   eventListeners.push(['disconnected', () => disconnectHandler(apiOptions, network, _node === undefined, provider)]);
  //   eventListeners.forEach(([eventName, callback]) => api.on(eventName, callback));
  // }
  // api.on('connected', () => connectedHandler(apiOptions, network));
  // api.on('disconnected', () => disconnectHandler(apiOptions, network, provider, _node === undefined));
  // api.on('ready', () => readyHandler(network));
}

// function subscribeNativeAssetsBalances(address: string, network: Network, assetJson: AssetJson): void {
//   const { name: networkName, api, parentId } = network;
//   const { precision, id: assetId } = assetJson;

//   api!.rx.query.system.account<ISubscribeData>(address).subscribe(async ({ data }) => {
//     // store.commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
//     //   walletAddress: address,
//     //   network: networkName,
//     //   assetId,
//     //   balance: formatBalance(data, precision),
//     //   parentId,
//     // });
//     const historyForNetwork = store.getters[NetworksGettersTypes.getHistory](assetId, address, networkName);

//     // store.commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
//     //   walletAddress: address,
//     //   network: networkName,
//     //   assetId,
//     //   balance: formatBalance(data, precision),
//     //   parentId,
//     // });

//     if (historyForNetwork)
//       NetworksController.fetchHistory(networkName, { address, ethereumAddress: address }, assetId, true, 45);
//   });
// }

// async function subscribeOrmlAssetsBalances(
//   address: string,
//   network: Network,
//   asset: AssetJson,
//   type: NetworkAssetsType
// ): Promise<void> {
//   const { name: networkName, api, parentId } = network;
//   const { precision, id: assetId, symbol } = asset;

//   const options = getAssetOptions(symbol, type, assetId);
//   const query = api!.rx.query;
//   const pallet =
//     type === 'equilibrium'
//       ? query.eqBalances.account<OrmlAccountData>(address, options)
//       : query.tokens?.accounts<OrmlAccountData>(address, options);

//     pallet.subscribe(async (data) => {
//       // store.commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
//       //   walletAddress: address,
//       //   network: networkName,
//       //   assetId,
//       //   balance: formatBalance(data, precision),
//       //   parentId,
//       // });
//     });
//   });
// }

// async function subscribeAssetsBalances(address: string, network: Network): Promise<void> {
//   const { api, assets } = network;

//   if (api === undefined) return;

//   await api?.isReadyOrError;

//   assets.forEach((networkAsset) => {
//     const { assetId, type } = networkAsset;
//     const assetJson = (store.getters[NetworksGettersTypes.getAssetsJson] as AssetJson[]).find(
//       ({ id }) => id === assetId
//     )!;

//     if (type === undefined) subscribeNativeAssetsBalances(address, network, assetJson);
//     else subscribeOrmlAssetsBalances(address, network, assetJson, type);
//   });
// }

// export { connectToApi, subscribeAssetsBalances };
