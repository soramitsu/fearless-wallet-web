import { type Route } from 'vue-router';
import { setTitle } from '@/helpers/only-web';
import { Components } from '@/router/routes';
import { FEARLESS_TITLE } from '@/consts/global';
import { i18n } from '@/locales';
import { IS_POPUP } from '@/consts/globalClient';
import { useAccountsStore } from '@/stores/accounts';

const updateTitle = (to: Route) => {
  if (IS_POPUP) return;
  const { name, meta, params } = to;

  const accountsStore = useAccountsStore();

  const tokenBalances = accountsStore.balances;
  const haveBalances = tokenBalances.length !== 0;
  const IsAssetsNetworkPage = name === Components.AssetNetworks;
  const IsAssetsHistoryPage = name === Components.AssetHistory;

  if (params && haveBalances && (IsAssetsNetworkPage || IsAssetsHistoryPage)) {
    if (IsAssetsNetworkPage) {
      const assetId = params.assetId;

      const symbol = tokenBalances.find(({ groupId }) => groupId === assetId)?.symbol;
      const title = symbol ? `${FEARLESS_TITLE} | ${symbol.toUpperCase()}` : FEARLESS_TITLE;

      setTitle(title);

      return;
    }

    if (IsAssetsHistoryPage) {
      const assetId = params.assetId;
      const network = params.selectedNetwork;

      const symbol = tokenBalances.find(({ groupId }) => groupId === assetId)?.symbol;
      const title = symbol ? `${FEARLESS_TITLE} | ${symbol.toUpperCase()} | ${network.toUpperCase()}` : FEARLESS_TITLE;

      setTitle(title);
    }
  } else {
    const toTitle = meta?.title ?? '';
    const tabName = (toTitle !== '' ? i18n.t(`browserTabs.${toTitle}`) : '') as string;

    const title = `${FEARLESS_TITLE} ${tabName !== '' ? '|' : ''} ${tabName.toUpperCase()}`;

    setTitle(title);
  }
};

export { updateTitle };
