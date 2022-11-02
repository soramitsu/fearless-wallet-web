<template>
  <div class="menu">
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
import { firstCharToUp } from '@/helpers/common';

type MenuItemType = 'wallet' | 'crowdloans' | 'staking' | 'polkaswap' | 'history';

@Component({
  components: { MenuItem },
})
export default class Menu extends Vue {
  walletItems = [Components.Accounts, Components.Export, Components.Nodes];
  menuItems: MenuItemType[] = ['wallet', 'crowdloans', 'staking', 'polkaswap', 'history'];

  get currentRouteName() {
    const route = this.$route.path.split('/')[2];

    return route;
  }

  checkActive(menuItem: MenuItemType) {
    const isHighlightWalletItem = this.walletItems.includes(this.$route.name as any);

    return (
      menuItem.toLowerCase() === this.currentRouteName ||
      (menuItem === 'wallet' && (this.$route.params.assetId !== undefined || isHighlightWalletItem))
    );
  }

  clickMenuItem(menuItem: MenuItemType) {
    if (this.currentRouteName === menuItem.toLowerCase()) return;

    const route = firstCharToUp(menuItem) as keyof typeof Components;

    this.$router.push({ name: Components[route] });
  }
}
</script>

<style lang="scss" scoped>
.menu {
  display: flex;
  min-height: 60px;
  justify-content: space-around;
  align-items: center;
  user-select: none;
  z-index: 199;
  margin: 0 0 -16px -16px;
  border-radius: 0 0 $default-border-radius;
  // background-color: rgba(0, 0, 0, 0.5);
  // backdrop-filter: blur(10px);
}
</style>
