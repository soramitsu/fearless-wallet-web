<template>
  <nav class="menu" data-testid="menu" :aria-label="t('primaryMenu.ariaLabel')">
    <MenuItem
      v-for="item in menuItems"
      :key="item.id"
      :name="item.label"
      :icon="item.icon"
      :data-destination="item.id"
      :isActive="activeDestination === item.id"
      :emphasized="item.id === 'polkaswap'"
      :aria-label="item.id === 'polkaswap' ? 'Polkaswap' : item.label"
      @click="open(item)"
    />
  </nav>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Components } from '@/router/routes';
import {
  rememberPrimaryRoute,
  resetPrimaryDestination,
  resolvePrimaryNavigationTarget,
  type PrimaryDestination,
} from '@/router/primaryNavigation';
import MenuItem from '@/screens/main/MenuItem.vue';
import { useAccountsStore } from '@/stores/accounts';
import { useI18n } from '@/locales/useI18n';
import { IS_EXTENSION } from '@/consts/global';
import { isSelectedWalletRecoveryOnly } from '@/util/walletRecoveryPolicy';
import { legacyWalletUpgradeMessages } from '@/locales/legacyWalletUpgrade';

type MenuDefinition = {
  id: PrimaryDestination;
  label: string;
  icon: string;
  route: Components;
};

const route = useRoute();
const router = useRouter();
const accountsStore = useAccountsStore();
const { t, locale } = useI18n();
const recoveryOnly = computed(() => IS_EXTENSION &&
  isSelectedWalletRecoveryOnly(accountsStore.accounts, accountsStore.selectedWallet.address));
const recoveryLabel = computed(() => legacyWalletUpgradeMessages[locale.value === 'ru-RU' ? 'ru-RU' : 'en-EN'].recoveryNavigation);
const menuItems = computed<MenuDefinition[]>(() => ([
  { id: 'portfolio', label: t('primaryMenu.portfolio'), icon: 'wallet', route: Components.Wallet },
  { id: 'defi', label: recoveryOnly.value ? recoveryLabel.value : t('primaryMenu.defi'), icon: 'pools', route: Components.Defi },
  { id: 'polkaswap', label: t('primaryMenu.polkaswap'), icon: 'polkaswap', route: Components.Polkaswap },
  { id: 'cross-chain', label: t('primaryMenu.crossChain'), icon: 'cross-chain', route: Components.CrossChain },
  { id: 'settings', label: t('primaryMenu.settings'), icon: 'settings', route: Components.Settings },
] as MenuDefinition[]).filter(({ id }) => !recoveryOnly.value ||
  id === 'portfolio' || id === 'defi' || id === 'settings'));

const activeDestination = computed(
  () => (route.meta.primaryNavigation as PrimaryDestination | undefined) ?? 'portfolio'
);

watch(
  [() => route.fullPath, () => accountsStore.selectedWallet.address],
  () => rememberPrimaryRoute(accountsStore.selectedWallet.address, route),
  { immediate: true }
);

function open(item: MenuDefinition): void {
  const root = { name: item.route };
  if (activeDestination.value === item.id) {
    resetPrimaryDestination(accountsStore.selectedWallet.address, item.id);
    router.replace(root);
    return;
  }
  router.replace(
    resolvePrimaryNavigationTarget(accountsStore.selectedWallet.address, activeDestination.value, item.id, root)
  );
}
</script>

<style lang="scss" scoped>
// Just tall enough for the raised Swap mark to meet the top edge, where its ring cuts the border: the dock is chrome,
// and every pixel it does not need goes to the page above it.
.menu {
  min-height: 68px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  align-items: end;
  margin: 0 -16px -16px;
  padding: 6px 8px 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  // The dock is chrome; without blur it takes the solid chrome tint (design-system 3.2).
  background: $fw-chrome-surface;
  user-select: none;
  z-index: 199;
}
</style>
