<template>
  <nav class="menu" data-testid="menu" :aria-label="t('primaryMenu.ariaLabel')">
    <MenuItem
      v-for="item in menuItems"
      :key="item.id"
      :name="item.label"
      :icon="item.icon"
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

type MenuDefinition = {
  id: PrimaryDestination;
  label: string;
  icon: string;
  route: Components;
};

const route = useRoute();
const router = useRouter();
const accountsStore = useAccountsStore();
const { t } = useI18n();
const menuItems = computed<MenuDefinition[]>(() => [
  { id: 'portfolio', label: t('primaryMenu.portfolio'), icon: 'wallet', route: Components.Wallet },
  { id: 'defi', label: t('primaryMenu.defi'), icon: 'pools', route: Components.Defi },
  { id: 'polkaswap', label: t('primaryMenu.polkaswap'), icon: 'polkaswap', route: Components.Polkaswap },
  { id: 'cross-chain', label: t('primaryMenu.crossChain'), icon: 'cross-chain', route: Components.CrossChain },
  { id: 'settings', label: t('primaryMenu.settings'), icon: 'settings', route: Components.Settings },
]);

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
.menu {
  min-height: 82px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: end;
  margin: 0 -16px -16px;
  padding: 8px 8px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(17, 17, 17, 0.96);
  user-select: none;
  z-index: 199;
}
</style>
