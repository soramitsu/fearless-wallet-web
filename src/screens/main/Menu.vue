<template>
  <nav class="menu" data-testid="menu" aria-label="Primary">
    <MenuItem
      v-for="item in menuItems"
      :key="item.id"
      :name="item.label"
      :icon="item.icon"
      :isActive="activeDestination === item.id"
      :emphasized="item.id === 'polkaswap'"
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

type MenuDefinition = {
  id: PrimaryDestination;
  label: string;
  icon: string;
  route: Components;
};

const route = useRoute();
const router = useRouter();
const accountsStore = useAccountsStore();
const menuItems: MenuDefinition[] = [
  { id: 'portfolio', label: 'Portfolio', icon: 'wallet', route: Components.Wallet },
  { id: 'defi', label: 'DeFi', icon: 'pools', route: Components.Defi },
  { id: 'polkaswap', label: 'Polkaswap', icon: 'polkaswap', route: Components.Polkaswap },
  { id: 'cross-chain', label: 'Cross-chain', icon: 'cross-chain', route: Components.CrossChain },
  { id: 'settings', label: 'Settings', icon: 'settings', route: Components.Settings },
];

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
    resolvePrimaryNavigationTarget(
      accountsStore.selectedWallet.address,
      activeDestination.value,
      item.id,
      root
    )
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
