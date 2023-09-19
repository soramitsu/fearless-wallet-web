import { Route } from 'vue-router';
import { TokenBalance } from '@extension-base/background/types/types';
import { Components } from '@/router/routes';
import { setTitle } from '@/helpers/common';
import { FEARLESS_TITLE } from '@/consts/global';
import { useStore } from '@/store';
import { i18n } from '@/locales';

const updateTitle = (to: Route) => {
  const { name, meta, params } = to;
  const store = useStore();
  const balances: TokenBalance[] = store.getters.getBalances;
  const haveBalances = balances.length !== 0;
  const IsAssetsNetworkPage = name === Components.AssetNetworks;
  const IsAssetsHistoryPage = name === Components.AssetHistory;

  if (params && haveBalances && (IsAssetsNetworkPage || IsAssetsHistoryPage)) {
    if (IsAssetsNetworkPage) {
      const assetId = params.assetId;

      const symbol = balances.find(({ assetId: _assetId }) => _assetId === assetId)?.symbol;
      const title = symbol ? `${FEARLESS_TITLE} | ${symbol.toUpperCase()}` : FEARLESS_TITLE;

      setTitle(title);

      return;
    }

    if (IsAssetsHistoryPage) {
      const assetId = params.assetId;
      const network = params.selectedNetwork;

      const symbol = balances.find(({ assetId: _assetId }) => _assetId === assetId)?.symbol;
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
