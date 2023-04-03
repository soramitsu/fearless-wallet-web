import { api as apiSora } from '@sora-substrate/util';
import type { Wallet, CustomAccounts } from '@/store';
import type { AssetJson, Networks, Network, AssetPrice, NetworkName, WalletAddress, AssetId } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import store from '@/store';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { URLS } from '@/consts/urls';
import { LocalStorage } from '@/controllers/localStorageController';

const lsNetworks = new LocalStorage('networks');
const zeroBalance = 'zero-balance';

type NetworksZeroBalance = Record<WalletAddress, Record<NetworkName, Record<AssetId, string>>>;

export class NetworksController {
  private static getNetworksZeroBalances(): NetworksZeroBalance {
    const balances = lsNetworks.get(zeroBalance);

    return balances.value ?? {};
  }

  public static isZeroBalanceNetwork({ address, ethereumAddress }: Wallet, networkName: NetworkName): boolean {
    const addressByNetwork = BaseApi.isEthereumNetwork(networkName) ? ethereumAddress : address;
    const balances = this.getNetworksZeroBalances();
    const balancesForNetwork = balances?.[addressByNetwork]?.[networkName] ?? {};
    const values = Object.values(balancesForNetwork);

    return values.length === 0 ? true : values.every((value) => value === 'true');
  }

  public static setNetworkZeroBalance(
    address: WalletAddress,
    networkName: NetworkName,
    assetId: string,
    izZeroBalance: boolean
  ): void {
    const balances = this.getNetworksZeroBalances();
    const balancesForAddress = balances[address] ?? {};
    const balancesForNetwork = balancesForAddress[networkName] ?? {};

    const newValue: NetworksZeroBalance = {
      ...balances,
      [address]: {
        ...balancesForAddress,
        [networkName]: {
          ...balancesForNetwork,
          [assetId]: `${izZeroBalance}`,
        },
      },
    };

    lsNetworks.set(zeroBalance, newValue);
  }

  static getNetworks(): Networks {
    return store.getters[NetworksGettersTypes.getNetworks];
  }

  static getNetwork(networkName: string): Network {
    return store.getters[NetworksGettersTypes.getNetwork](networkName);
  }

  public static getAssetsJson(): AssetJson[] {
    return store.getters[NetworksGettersTypes.getAssetsJson];
  }

  public static getAssetIcon(assetId: string): string {
    return store.getters[NetworksGettersTypes.getAssetIcon](assetId);
  }

  public static getAssetPrice(assetId: string): AssetPrice {
    return store.getters[NetworksGettersTypes.getAssetPrice](assetId);
  }

  public static async connectToNodes(): Promise<void> {
    await store.dispatch(NetworksActionTypes.CONNECT_TO_NODES);
  }

  public static async fetchJsons(): Promise<void> {
    await store.dispatch(NetworksActionTypes.FETCH_JSONS, {
      chainsUrl: URLS.CHAINS,
      assetsUrl: URLS.ASSETS,
      fiatsUrl: URLS.FIATS,
    });

    await store.dispatch(NetworksActionTypes.FETCH_ASSETS_PRICE);
  }

  public static async fetchHistory(
    networkName: string,
    wallet: Wallet,
    assetId: string,
    isPreviously = false,
    delay?: number
  ): Promise<void> {
    if (delay !== undefined) {
      const timeout = delay * 1000;

      setTimeout(() => {
        store.dispatch(NetworksActionTypes.FETCH_HISTORY, { networkName, wallet, assetId, isPreviously });
      }, timeout);

      return;
    }

    await store.dispatch(NetworksActionTypes.FETCH_HISTORY, { networkName, wallet, assetId, isPreviously });
  }

  public static subscribeToBalancesOfNetworks(accounts: CustomAccounts, networksProps?: Networks): void {
    store.dispatch(NetworksActionTypes.SUBSCRIBE_TO_BALANCES, { accounts, networksProps });
  }

  public static async toggleActiveNode(
    network: string,
    nodeName?: string,
    nodeUrl?: string,
    oldNodeUrl?: string
  ): Promise<void> {
    await store.dispatch(NetworksActionTypes.TOGGLE_ACTIVE_NODE, { network, nodeName, nodeUrl, oldNodeUrl });
  }

  public static async initializeSora() {
    await apiSora.initialize(false);
  }

  public static async calcSoraFee() {
    await apiSora.calcStaticNetworkFees();

    store.commit(NetworksMutationTypes.SET_SORA_FEE, {
      fee: apiSora.NetworkFee.Swap,
    });
  }
}
