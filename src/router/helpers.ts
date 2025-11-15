import type { RouteLocationNormalized } from 'vue-router';
import type { NetworkName } from '@/interfaces';
import type { AccountStore, ExtensionStore, NetworkParams, StakingStore } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import { setTitle } from '@/helpers/only-web';
import { Components } from '@/router/routes';
import { FEARLESS_TITLE } from '@/consts/global';
import { i18n } from '@/locales';
import { IS_POPUP } from '@/consts/globalClient';
import { useAccountsStore } from '@/stores';

const hasSelectedWallet = (accountsStore: AccountStore) => accountsStore.selectedWallet.address.length !== 0;
const haveAuthRequests = (extensionStore: ExtensionStore): number => extensionStore.authRequests.length;
const haveSignRequests = (extensionStore: ExtensionStore): number =>
  extensionStore.signRequests.length || Object.keys(extensionStore.signEvmRequests).length;
const haveMetaRequests = (extensionStore: ExtensionStore): number => extensionStore.metaRequests.length;
const getStakingNetwork = async (stakingStore: StakingStore, network: NetworkName): Promise<NetworkParams> =>
  await new Promise((res) => setTimeout(() => res(stakingStore.getStakingNetwork(network)), 100));

const updateTitle = (to: RouteLocationNormalized) => {
  if (IS_POPUP) return;
  const { name, meta, params } = to;

  const accountsStore = useAccountsStore();

  const tokenBalances = accountsStore.balances;
  const haveBalances = tokenBalances.length !== 0;
  const IsAssetsNetworkPage = name === Components.AssetNetworks;
  const IsAssetsHistoryPage = name === Components.AssetHistory;

  if (params && haveBalances && (IsAssetsNetworkPage || IsAssetsHistoryPage)) {
    const assetIdParam = Array.isArray(params.assetId) ? params.assetId[0] : params.assetId;

    if (IsAssetsNetworkPage) {
      const assetId = assetIdParam;

      const symbol = tokenBalances.find((tokenGroup: TokenGroup) => tokenGroup.groupId === assetId)?.symbol;
      const title = symbol ? `${FEARLESS_TITLE} | ${symbol.toUpperCase()}` : FEARLESS_TITLE;

      setTitle(title);

      return;
    }

    if (IsAssetsHistoryPage) {
      const assetId = assetIdParam;
      const selectedNetwork = Array.isArray(params.selectedNetwork)
        ? params.selectedNetwork[0]
        : params.selectedNetwork;

      const symbol = tokenBalances.find((tokenGroup: TokenGroup) => tokenGroup.groupId === assetId)?.symbol;
      const networkTitle = selectedNetwork?.toUpperCase();
      const title = symbol
        ? `${FEARLESS_TITLE} | ${symbol.toUpperCase()}${networkTitle ? ` | ${networkTitle}` : ''}`
        : FEARLESS_TITLE;

      setTitle(title);
    }
  } else {
    const toTitle = meta?.title ?? '';
    const tabName = (toTitle !== '' ? i18n.global.t(`browserTabs.${toTitle}`) : '') as string;

    const title = `${FEARLESS_TITLE} ${tabName !== '' ? '|' : ''} ${tabName.toUpperCase()}`;

    setTitle(title);
  }
};

export { getStakingNetwork, haveAuthRequests, hasSelectedWallet, haveMetaRequests, haveSignRequests, updateTitle };
