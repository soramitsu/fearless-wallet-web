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
import { Getter } from 'vuex-class';
import { Components } from '@/router/routes';
import MenuItem from '@/screens/main/MenuItem.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { type SelectedWallet } from '@/store';
import { IS_PRODUCTION } from '@/consts/global';
import { type NetworkName } from '@/interfaces';
import { SORA_MAINNET } from '@/consts/sora';
import { isSameString } from '@/helpers';

type MenuItemType = 'Wallet' | 'Staking' | 'Polkaswap';

@Component({
  components: { MenuItem },
})
export default class Menu extends Vue {
  walletItems: string[] = [
    Components.Currencies,
    Components.Nfts,
    Components.AccountSetting,
    Components.Export,
    Components.Nodes,
  ];
  stakingItems: string[] = [Components.MyStake];

  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.selectedNetwork) selectedNetwork!: NetworkName;

  get menuItems() {
    const array: MenuItemType[] = [Components.Wallet, Components.Staking];

    if (IS_PRODUCTION || (!IS_PRODUCTION && !isSameString(this.selectedNetwork, SORA_MAINNET)))
      array.push(Components.Polkaswap);

    return array;
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
  min-height: 70px;
  justify-content: space-around;
  align-items: center;
  user-select: none;
  z-index: 199;
  margin: 0 0 -16px -16px;
  border-radius: 0 0 $default-border-radius;
}
</style>
