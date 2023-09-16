import Vue from 'vue';
import VueRouter, { Route } from 'vue-router';
import routes, { Components } from './routes';
import { setTitle } from '@/helpers/common';
import { FEARLESS_TITLE } from '@/consts/global';
import store from '@/store';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';

Vue.use(VueRouter);

const updateTitle = (to: Route) => {
  const { name, meta, params } = to;
  const balances: TokenBalance[] = store.getters.getBalances ?? [];

  if (name === Components.AssetNetworks && balances.length !== 0) {
    const assetId = params?.assetId;

    const { symbol } = balances.find(({ assetId: _assetId }) => _assetId === assetId)!;

    const title = `${FEARLESS_TITLE} | ${symbol.toUpperCase()}`;

    setTitle(title);
  } else if (name === Components.AssetHistory && balances.length !== 0) {
    const assetId = params?.assetId;
    const network = params?.selectedNetwork;

    const { symbol } = balances.find(({ assetId: _assetId }) => _assetId === assetId)!;

    const title = `${FEARLESS_TITLE} | ${symbol.toUpperCase()} | ${network.toUpperCase()}`;

    setTitle(title);
  } else {
    const toTitle = meta?.title ?? '';
    const title = `${FEARLESS_TITLE}${toTitle !== '' ? ' | ' : ''}${toTitle}`;

    setTitle(title);
  }
};

const router = new VueRouter({
  mode: 'hash',
  base: process.env.BASE_URL,
  routes,
});

router.beforeEach((to, from, next) => {
  // setTimeout нужен, чтобы установить нужный title после обновления страницы
  // так же, 150ms минимальное время для того, чтобы balances успели подтянуться из SW
  setTimeout(() => updateTitle(to), 150);

  next();
});

export default router;
