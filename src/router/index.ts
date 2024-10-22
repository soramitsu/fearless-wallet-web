import Vue from 'vue';
import VueRouter from 'vue-router';
import routes, { Components } from '@/router/routes';
import { updateTitle } from '@/util/routing';
import {
  keyringIsLocked,
  hasMasterPassword,
  hasAccounts,
  isNeedMigration,
  isOnboardingRequired,
} from '@/extension/messaging';
import { IS_PRODUCTION, IS_TEST_ONLY } from '@/consts/global';

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

  const isRequiredOnboarding = await isOnboardingRequired();

  if (IS_PRODUCTION || IS_TEST_ONLY) {
    if (to.name !== Components.Onboarding && isRequiredOnboarding) {
      next({ name: Components.Onboarding });

      return;
    }
  }

  const needMigration = await isNeedMigration();

  if (
    to.name !== Components.MigrationDescription &&
    to.name !== Components.MigrationAccounts &&
    to.name !== Components.Onboarding
  ) {
    const isFromMigrationDescriptionToChangePass =
      from.name === Components.MigrationDescription && to.name === Components.ChangePassword;

    if (isFromMigrationDescriptionToChangePass) next();
    else if (needMigration) next({ name: Components.MigrationDescription });
    else next();
  } else if (to.name === Components.MigrationDescription || to.name === Components.MigrationAccounts) {
    if (!needMigration) next({ name: Components.Welcome });
    else next();
  }

  const isLock = await keyringIsLocked();
  const hasPass = await hasMasterPassword();

  if (to.name === Components.Welcome) {
    if (hasPass && isLock) next({ name: Components.Unlock });
    else next();

    return;
  }

  if (to.name === Components.ChangePassword) next();
  else {
    const hasAccount = await hasAccounts();

    if (!hasPass && !needMigration && hasAccount) next({ name: Components.ChangePassword });
    else if (to.name === Components.Unlock) {
      if (!isLock) next({ name: Components.Welcome });
      else next();
    } else if (to.name === Components.ResetWallet) next();
    else {
      if (isLock) next({ name: Components.Unlock });
      else next();
    }
  }
});

export default router;
