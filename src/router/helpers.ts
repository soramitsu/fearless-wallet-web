import type { RouteLocationNormalized } from 'vue-router';
import type { NetworkName } from '@/interfaces';
import type { NetworkParams } from '@/stores';
import type { ExtensionStore } from '@/stores/extension';
import type { AccountStore } from '@/stores/accounts';
import type { StakingStore } from '@/stores/staking';
import { setTitle } from '@/helpers/only-web';
import { Components } from '@/router/routes';
import { FEARLESS_TITLE } from '@/consts/global';
import { i18n } from '@/locales';
import { IS_POPUP } from '@/consts/globalClient';
import { useAccountsStore } from '@/stores/accounts';

const hasSelectedWallet = (accountsStore: AccountStore) => accountsStore.selectedWallet.address.length !== 0;
const haveAuthRequests = (extensionStore: ExtensionStore): number => extensionStore.authRequests.length;
const haveSignRequests = (extensionStore: ExtensionStore): number =>
  extensionStore.signRequests.length || Object.keys(extensionStore.signEvmRequests).length;
const haveMetaRequests = (extensionStore: ExtensionStore): number => extensionStore.metaRequests.length;
const getStakingNetwork = async (stakingStore: StakingStore, network: NetworkName): Promise<NetworkParams> =>
  await new Promise((res) => setTimeout(() => res(stakingStore.getStakingNetwork(network)), 100));

const routeParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

const updateTitle = (to: RouteLocationNormalized) => {
  if (IS_POPUP) return;
  const { name, meta, params } = to;

  const accountsStore = useAccountsStore();

  const tokenBalances = accountsStore.balances;
  const haveBalances = tokenBalances.length !== 0;
  const IsAssetsNetworkPage = name === Components.AssetNetworks;
  const IsAssetsHistoryPage = name === Components.AssetHistory;

  if (params && haveBalances && (IsAssetsNetworkPage || IsAssetsHistoryPage)) {
    if (IsAssetsNetworkPage) {
      const assetId = routeParam(params.assetId);

      const symbol = tokenBalances.find(({ groupId }) => groupId === assetId)?.symbol;
      const title = symbol ? `${FEARLESS_TITLE} | ${symbol.toUpperCase()}` : FEARLESS_TITLE;

      setTitle(title);

      return;
    }

    if (IsAssetsHistoryPage) {
      const assetId = routeParam(params.assetId);
      const network = routeParam(params.selectedNetwork);

      const symbol = tokenBalances.find(({ groupId }) => groupId === assetId)?.symbol;
      const title = symbol ? `${FEARLESS_TITLE} | ${symbol.toUpperCase()} | ${network.toUpperCase()}` : FEARLESS_TITLE;

      setTitle(title);
    }
  } else {
    const toTitle = String(meta?.title ?? '');
    const tabName = toTitle !== '' ? i18n.global.t(`browserTabs.${toTitle}`) : '';

    const title = `${FEARLESS_TITLE} ${tabName !== '' ? '|' : ''} ${tabName.toUpperCase()}`;

    setTitle(title);
  }
};

export { getStakingNetwork, haveAuthRequests, hasSelectedWallet, haveMetaRequests, haveSignRequests, updateTitle };
