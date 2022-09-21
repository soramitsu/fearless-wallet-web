import { ApiPromise, WsProvider } from '@polkadot/api';
import { assetFromToken } from '@equilab/api';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { AugmentedActionContext as Context } from '@/store/networks/types';
import type { Networks, DisconnectNetworks, Network } from '@/interfaces/networks';
import type { OrmlAccountData } from '@open-web3/orml-types/interfaces/tokens';
import { formatBalance } from '@/util/balances';
import { MutationTypes } from '@/store/networks/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { accountController } from '@/controllers/accountController';
import NetworksController from '@/controllers/networksController';

const ORML_PALLETS_TYPES = ['ormlChain'];

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

function updateCurrencyInfo(context: Context, network: Network) {
  const { commit, rootState } = context;
  const { assets: networkAssets, parentId } = network;

  networkAssets.forEach(({ assetId }) => {
    const selectedFiat = rootState.account.selectedFiat;

    commit(MutationTypes.UPDATE_CURRENCY, {
      tokenId: assetId,
      selectedFiat,
      parentId,
    });
  });
}

function subscribeUtilityTokensBalances(context: Context, address: string, network: Network) {
  const { name: networkName, parentId, api, assets: networkAssets } = network;
  const networkUtilityAsset = networkAssets.find( // eslint-disable-line
    ({ isUtility, type }) => isUtility && !ORML_PALLETS_TYPES.includes(type as string) && type !== 'equilibrium'
  )!;

  if (!networkUtilityAsset) return;

  const { getters, commit, state } = context;
  const { assets } = state;
  const { assetId, type } = networkUtilityAsset;
  const precision = assets.find((asset) => asset.id === assetId)?.precision ?? 0;

  api.rx.query.system.account(address).subscribe(async (result) => {
    const data = (result as any).data;
    const balance = formatBalance(data as AccountData, precision);
    const historyForNetwork = getters[NetworksGettersTypes.getHistory](networkName);
    const historyForAddress = historyForNetwork?.[address];
    const delay = historyForAddress ? 45 : 0;

    commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
      walletAddress: address,
      network: networkName,
      tokenId: assetId,
      balance,
      parentId,
      type,
    });

    NetworksController.loadHistory(networkName, address, delay);
  });
}

function subscribeOrmlTokensBalances(context: Context, address: string, network: Network) {
  const { commit, state } = context;
  const { assets } = state;
  const { name: networkName, api, assets: networkAssets, parentId } = network;

  networkAssets.forEach(({ assetId, type }) => {
    if (type === undefined) return;

    const precision = assets.find((asset) => asset.id === assetId)?.precision ?? 0;
    const { symbol } = assets.find(({ id }) => id === assetId)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const options = { Token: symbol.toUpperCase() };

    if (type === 'stableAssetPoolToken' || type === 'foreignAsset' || type === 'liquidCrowdloan') return; // TODO: fix
    if (symbol === 'csm') return; // TODO: fix

    const isEquilibrium = type === 'equilibrium';
    const assetEquilibrium = assetFromToken(symbol)[0];
    const pallet = isEquilibrium
      ? api.rx.query.eqBalances.account(address, assetEquilibrium)
      : api.rx.query.tokens?.accounts(address, options);

    pallet.subscribe(async (data) => {
      const balance = formatBalance(data as any as OrmlAccountData, precision);
      console.log(symbol, balance);

      commit(MutationTypes.UPDATE_CURRENCY_BALANCE, {
        walletAddress: address,
        network: networkName,
        tokenId: assetId,
        balance,
        parentId,
        type,
      });
    });
  });
}

async function subscribeTokensBalances(context: Context, address: string, network: Network) {
  const { api } = network;

  await api.isReadyOrError;

  subscribeUtilityTokensBalances(context, address, network);
  subscribeOrmlTokensBalances(context, address, network);
}

export { connectToApi, connectToNetworksApi, updateCurrencyInfo, subscribeTokensBalances };
