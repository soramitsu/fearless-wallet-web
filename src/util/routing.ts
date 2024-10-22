import { type Route } from 'vue-router';
import type { TokenGroup } from '@extension-base/background/types/types';
import { Components } from '@/router/routes';
import { setTitle } from '@/helpers/common';
import { FEARLESS_TITLE } from '@/consts/global';
import { useStore } from '@/store';
import { i18n } from '@/locales';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { IS_POPUP } from '@/consts/globalClient';

const updateTitle = (to: Route) => {
  if (IS_POPUP) return;

  const { name, meta, params } = to;
  const store = useStore();
  const tokenBalances: TokenGroup[] = store.getters[AccountsGettersTypes.getBalances];
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
