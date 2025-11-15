<template>
  <div class="menu" data-testid="menu">
    <MenuItem
      v-for="menuItem in menuItems"
      :key="menuItem"
      :name="menuItem"
      :isActive="checkActive(menuItem)"
      @click="clickMenuItem(menuItem)"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Components } from '@/router/routes';
import MenuItem from '@/screens/main/MenuItem.vue';
import { IS_PRODUCTION } from '@/consts/global';
import { SORA_MAINNET } from '@/consts/sora';
import { isSameString } from '@/helpers';
import { useAccountsStore } from '@/stores/accounts';

type MenuItemType = 'Wallet' | 'Staking' | 'Polkaswap';

defineOptions({
  name: 'MainMenu',
});

const accountsStore = useAccountsStore();
const router = useRouter();
const route = useRoute();

const walletItems: string[] = [
  Components.Currencies,
  Components.Nfts,
  Components.AccountSetting,
  Components.Export,
  Components.Nodes,
];

const stakingItems: string[] = [Components.MyStake];

const isTonWallet = computed(() => accountsStore.selectedWallet.isTon);

const menuItems = computed(() => {
  const array: MenuItemType[] = [Components.Wallet];

  if (!isTonWallet.value) {
    array.push(Components.Staking);

    if (IS_PRODUCTION || (!IS_PRODUCTION && !isSameString(accountsStore.selectedNetwork, SORA_MAINNET))) {
      array.push(Components.Polkaswap);
    }
  }

  return array;
});

const currentRouteName = computed(() => {
  const [, , secondSegment] = route.path.split('/');

  return secondSegment;
});

const routeName = computed(() => route.name as string | undefined);

const checkActive = (menuItem: MenuItemType) => {
  if (menuItem === 'Wallet') {
    const isHighlightWalletItem = routeName.value ? walletItems.includes(routeName.value) : false;
    const haveAssetId = route.params.assetId !== undefined;

    if (isHighlightWalletItem || haveAssetId) return true;
  }

  if (menuItem === 'Staking') {
    const isHighlightStakingItem = routeName.value ? stakingItems.includes(routeName.value) : false;

    if (isHighlightStakingItem) return true;
  }

  return menuItem.toLowerCase() === currentRouteName.value;
};

const clickMenuItem = (menuItem: MenuItemType) => {
  if (currentRouteName.value === menuItem.toLowerCase()) return;

  const targetRoute = menuItem === 'Polkaswap' ? Components.SoraSwap : Components[menuItem as keyof typeof Components];

  router.push({ name: targetRoute });
};
</script>

<style lang="scss" scoped>
.menu {
  display: flex;
  min-height: 82px;
  justify-content: space-around;
  align-items: center;
  user-select: none;
  z-index: 199;
  margin: 0 0 -16px -16px;
  border-radius: 0 0 $default-border-radius;
}
</style>
