<template>
  <div class="menu" data-testid="menu">
    <MenuItem
      v-for="menuItem in menuItems"
      :key="menuItem"
      :name="menuItem"
      :isActive="checkActive(menuItem)"
      @click.native="clickMenuItem(menuItem)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

import { Components } from '@/router/routes';
import MenuItem from '@/screens/main/MenuItem.vue';
import { IS_PRODUCTION } from '@/consts/global';
import { SORA_MAINNET } from '@/consts/sora';
import { isSameString } from '@/helpers';
import { useAccountsStore } from '@/stores/accounts';

type MenuItemType = 'Wallet' | 'Staking' | 'Polkaswap';

export const MENU_HEIGHT = 70;

@Component({
  components: { MenuItem },
})
export default class Menu extends Vue {
  accountsStore = useAccountsStore();

  walletItems: string[] = [
    Components.Currencies,
    Components.Nfts,
    Components.AccountSetting,
    Components.Export,
    Components.Nodes,
  ];

  stakingItems: string[] = [Components.MyStake];

  get menuItems() {
    const array: MenuItemType[] = [Components.Wallet];

    if (!this.isTonWallet) {
      if (IS_PRODUCTION || (!IS_PRODUCTION && !isSameString(this.accountsStore.selectedNetwork, SORA_MAINNET)))
        array.push(Components.Polkaswap);

      array.push(Components.Staking);
    }

    return array;
  }

  get isTonWallet() {
    return this.accountsStore.selectedWallet.isTon;
  }

  get currentRouteName() {
    const route = this.$route.path.split('/')[2];

    return route;
  }

  get routeName() {
    return this.$route.name as string;
  }

  checkActive(menuItem: MenuItemType) {
    if (menuItem === 'Wallet') {
      const isHighlightWalletItem = this.walletItems.includes(this.routeName);
      const haveAssetId = this.$route.params.assetId !== undefined;

      if (isHighlightWalletItem || haveAssetId) return true;
    }

    if (menuItem === 'Staking') {
      const isHighlightWalletItem = this.stakingItems.includes(this.routeName);

      if (isHighlightWalletItem) return true;
    }

    return menuItem.toLowerCase() === this.currentRouteName;
  }

  clickMenuItem(menuItem: MenuItemType) {
    if (this.currentRouteName === menuItem.toLowerCase()) return;

    const route = menuItem as keyof typeof Components;

    const name = menuItem === 'Polkaswap' ? Components.SoraSwap : Components[route];

    this.$router.push({
      name,
    });
  }
}
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
