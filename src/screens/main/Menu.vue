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
import { Getter } from 'vuex-class';
import { Components } from '@/router/routes';
import MenuItem from '@/screens/main/MenuItem.vue';
import { firstCharToUp } from '@/helpers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';

type MenuItemType = 'wallet' | 'crowdloans' | 'staking' | 'polkaswap';

@Component({
  components: { MenuItem },
})
export default class Menu extends Vue {
  walletItems: string[] = [Components.Accounts, Components.Export, Components.Nodes];
  stakingItems: string[] = [Components.MyStake];
  menuItems: MenuItemType[] = ['wallet', 'staking', 'crowdloans', 'polkaswap'];

  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get currentRouteName() {
    const route = this.$route.path.split('/')[2];

    return route;
  }

  get routeName() {
    return this.$route.name as string;
  }

  checkActive(menuItem: MenuItemType) {
    if (menuItem === 'wallet') {
      const isHighlightWalletItem = this.walletItems.includes(this.routeName);
      const haveAssetId = this.$route.params.assetId !== undefined;

      if (isHighlightWalletItem || haveAssetId) return true;
    }

    if (menuItem === 'staking') {
      const isHighlightWalletItem = this.stakingItems.includes(this.routeName);

      if (isHighlightWalletItem) return true;
    }

    return menuItem.toLowerCase() === this.currentRouteName;
  }

  clickMenuItem(menuItem: MenuItemType) {
    if (this.currentRouteName === menuItem.toLowerCase()) return;

    const route = firstCharToUp(menuItem) as keyof typeof Components;

    const accountParams = {
      address: this.selectedWallet.address,
      name: this.selectedWallet.name,
      ethereumAddress: this.selectedWallet.ethereumAddress,
      isMobile: this.selectedWallet.isMobile ? 'mobile' : '',
    };

    this.$router.push({
      name: Components[route],
      params: {
        ...(route === Components.Accounts ? accountParams : {}),
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.menu {
  display: flex;
  min-height: 70px;
  justify-content: space-around;
  align-items: center;
  user-select: none;
  z-index: 199;
  margin: 0 0 -16px -16px;
  border-radius: 0 0 $default-border-radius;
}
</style>
