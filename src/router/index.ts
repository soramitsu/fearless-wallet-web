import { createRouter, createWebHashHistory } from 'vue-router';
import { updateTitle } from './helpers';
import routes, { Components } from '@/router/routes';
import { resolveUniversalWalletMigrationRedirect } from '@/router/universalWalletMigrationGuard';
import {
  keyringIsLocked,
  hasMasterPassword,
  hasAccounts,
  isNeedMigration,
  isOnboardingRequired,
} from '@/extension/messaging';
import { IS_EXTENSION, IS_PRODUCTION, IS_TEST_ONLY } from '@/consts/global';
import { resolvePrimaryBackTarget, type PrimaryDestination } from '@/router/primaryNavigation';
import { useAccountsStore } from '@/stores/accounts';

const router = createRouter({
  history: createWebHashHistory(IS_EXTENSION ? process.env.BASE_URL : undefined),
  routes,
});

// Component-level back actions stay inside the active destination stack. Tab
// switches use replace(), so the browser history does not interleave tabs.
const browserBack = router.back.bind(router);
router.back = () => {
  const route = router.currentRoute.value;
  const destination = route.meta.primaryNavigation as PrimaryDestination | undefined;

  if (!destination) {
    browserBack();
    return;
  }

  const roots = {
    portfolio: { name: Components.Wallet },
    defi: { name: Components.Defi },
    polkaswap: { name: Components.Polkaswap },
    'cross-chain': { name: Components.CrossChain },
    settings: { name: Components.Settings },
  };
  const walletAddress = useAccountsStore().selectedWallet.address;

  void router.replace(resolvePrimaryBackTarget(walletAddress, route, roots[destination]));
};

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
  const isLock = await keyringIsLocked();

  // If the extension is locked, skip the migration step.
  // This can happen if the user set a password during migration and then locked the extension.
  if (!isLock && !isRequiredOnboarding) {
    const isKeyringMigrationRoute =
      to.name === Components.MigrationDescription || to.name === Components.MigrationAccounts;

    if (needMigration) {
      const isFromMigrationDescriptionToChangePass =
        from.name === Components.MigrationDescription && to.name === Components.ChangePassword;

      if (isFromMigrationDescriptionToChangePass || isKeyringMigrationRoute || to.name === Components.Onboarding) {
        next();

        return;
      }

      next({ name: Components.MigrationDescription });

      return;
    }

    if (isKeyringMigrationRoute) {
      next({ name: Components.Welcome });

      return;
    }

    // Account presence is authoritative for continuity of access. Optional
    // network metadata or its export inventory can be absent after an upgrade.
    const universalMigrationRedirect = resolveUniversalWalletMigrationRedirect({
      action: (await hasAccounts()) ? 'normal-access' : 'create-universal-wallet',
      routeName: to.name,
    });

    if (universalMigrationRedirect) {
      next({ name: universalMigrationRedirect });

      return;
    }
  }

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
      if (isLock && to.name !== Components.Onboarding) {
        next({ name: Components.Unlock, query: { redirect: to.fullPath } });
      } else next();
    }
  }
});

export default router;
