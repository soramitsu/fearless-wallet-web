import { nextTick } from 'vue';
import { createRouter, createWebHashHistory, type NavigationGuardNext, type RouteLocationNormalized } from 'vue-router';
import { updateTitle } from './helpers';
import routes, { Components } from '@/router/routes';
import {
  keyringIsLocked,
  hasMasterPassword,
  hasAccounts,
  isNeedMigration,
  isOnboardingRequired,
} from '@/extension/messaging';
import { IS_EXTENSION, IS_PRODUCTION, IS_TEST_ONLY } from '@/consts/global';

const router = createRouter({
  history: createWebHashHistory(IS_EXTENSION ? process.env.BASE_URL : undefined),
  routes,
});

router.beforeEach(async (to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext) => {
  const targetName = to.name as Components | undefined;
  const sourceName = from.name as Components | undefined;
  const isRequiredOnboarding = await isOnboardingRequired();

  if ((IS_PRODUCTION || IS_TEST_ONLY) && targetName !== Components.Onboarding && isRequiredOnboarding) {
    next({ name: Components.Onboarding });

    return;
  }

  const [needMigration, isLocked] = await Promise.all([isNeedMigration(), keyringIsLocked()]);

  if (!isLocked && !isRequiredOnboarding) {
    const isMigrationTarget =
      targetName === Components.MigrationDescription || targetName === Components.MigrationAccounts;

    if (!isMigrationTarget && targetName !== Components.Onboarding) {
      const isFromMigrationToChangePassword =
        sourceName === Components.MigrationDescription && targetName === Components.ChangePassword;

      if (!isFromMigrationToChangePassword && needMigration) {
        next({ name: Components.MigrationDescription });

        return;
      }
    } else if (isMigrationTarget && !needMigration) {
      next({ name: Components.Welcome });

      return;
    }
  }

  const hasPass = await hasMasterPassword();

  if (targetName === Components.Welcome) {
    if (hasPass && isLocked) next({ name: Components.Unlock });
    else next();

    return;
  }

  if (targetName === Components.ChangePassword) {
    next();

    return;
  }

  const hasAccount = await hasAccounts();

  if (!hasPass && !needMigration && hasAccount) {
    next({ name: Components.ChangePassword });

    return;
  }

  if (targetName === Components.Unlock) {
    if (!isLocked) next({ name: Components.Welcome });
    else next();

    return;
  }

  if (targetName === Components.ResetWallet) {
    next();

    return;
  }

  if (isLocked && targetName !== Components.Onboarding) {
    next({ name: Components.Unlock });

    return;
  }

  next();
});

router.afterEach(async (to) => {
  await nextTick();
  updateTitle(to);
});

export default router;
