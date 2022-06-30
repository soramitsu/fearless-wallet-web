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

type MenuItemType = 'Wallet' | 'Crowdloans' | 'Staking' | 'DEX' | 'History';

@Component({
  components: { MenuItem },
})
export default class Menu extends Vue {
  menuItems: MenuItemType[] = ['Wallet', 'Crowdloans', 'Staking', 'DEX', 'History'];
  selectedItem = 'Wallet';

  get currentRouteName() {
    const route = this.$route.path.split('/')[2];

    return route;
  }

  checkActive(menuItem: MenuItemType) {
    return (
      menuItem.toLowerCase() === this.currentRouteName ||
      (menuItem === 'Wallet' && this.$route.params.token !== undefined) ||
      (menuItem === 'Wallet' && this.$route.name === 'Account')
    );
  }

  clickMenuItem(menuItem: MenuItemType) {
    if (this.currentRouteName === menuItem.toLowerCase()) return;

    this.$router.push({ name: Components[menuItem] });
  }
}
</script>

<style lang="scss" scoped>
.menu {
  display: flex;
  flex: 0 0 80px;
  justify-content: space-around;
  align-items: center;
  z-index: 199;
  width: $extension-width;
  margin: 0 0 -16px -16px;
  border-radius: 0 0 $default-border-radius $default-border-radius;
  // background-color: rgba(0, 0, 0, 0.5);
  // backdrop-filter: blur(10px);
}
</style>
