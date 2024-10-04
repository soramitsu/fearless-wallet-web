import Vue from 'vue';
import VueRouter from 'vue-router';
import routes, { Components } from '@/router/routes';
import { updateTitle } from '@/util/routing';
import { keyringIsLocked, hasMasterPassword, hasAccounts, isNeedMigration } from '@/extension/messaging';

Vue.use(VueRouter);

const router = new VueRouter({
  mode: 'hash',
  base: process.env.BASE_URL,
  routes,
});

router.beforeEach(async (to, from, next) => {
  // setTimeout нужен, чтобы установить нужный title после обновления страницы
  // так же, 150ms минимальное время для того, чтобы balances успели подтянуться из SW
  setTimeout(() => updateTitle(to), 150);

  const needMigration = await isNeedMigration();

  if (to.name !== Components.MigrationDescription && to.name !== Components.MigrationAccounts) {
    const isFromMigrationDescriptionToChangePass =
      from.name === Components.MigrationDescription && to.name === Components.ChangePassword;

    if (isFromMigrationDescriptionToChangePass) next();
    else if (needMigration) next({ name: Components.MigrationDescription });
    else next();
  } else if (to.name === Components.MigrationDescription || to.name === Components.MigrationAccounts) {
    if (!needMigration) next({ name: Components.Welcome });
    else next();
  }

  if (to.name === Components.Welcome) {
    const isLock = await keyringIsLocked();
    const hasPass = await hasMasterPassword();

    if (hasPass && isLock) next({ name: Components.Unlock });
    else next();

    return;
  }

  if (to.name === Components.ChangePassword) {
    const hasAccount = await hasAccounts();

    if (from.name === Components.Welcome || hasAccount) next();
    else next({ name: Components.Welcome });

    return;
  }

  const hasPass = await hasMasterPassword();

  if (!hasPass && !needMigration) next({ name: Components.ChangePassword });
  else if (to.name === Components.Unlock || to.name === Components.ResetWallet) next();
  else {
    const isLock = await keyringIsLocked();

    if (isLock) next({ name: Components.Unlock });
    else next();
  }
});

export default router;
