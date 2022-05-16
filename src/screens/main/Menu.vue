<template>
  <div class="menu">
    <MenuItem
      v-for="menuItem in menuItems"
      :key="menuItem"
      :name="menuItem"
      :isActive="menuItem === currentRouteNameWithFirstCharUp"
      @click.native="clickMenuItem(menuItem)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import { firstCharToUp } from '@/util/stringHelper';
import MenuItem from '@/screens/main/MenuItem.vue';

type MenuItems = 'Wallet' | 'Crowdloans' | 'Staking' | 'DEX' | 'History';

@Component({
  components: { MenuItem },
})
export default class Menu extends Vue {
  menuItems: MenuItems[] = ['Wallet', 'Crowdloans', 'Staking', 'DEX', 'History'];
  selectedItem = 'Wallet';

  get currentRouteNameWithFirstCharUp() {
    const route = this.$route.path.split('/')[2];

    return firstCharToUp(route);
  }

  clickMenuItem(name: MenuItems) {
    if (this.currentRouteNameWithFirstCharUp === name) return;

    this.$router.push({ name: Components[name] });
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
  width: var(--extension-width);
  margin: 0 0 -16px -16px;
  border-radius: 0 0 var(--default-border-radius) var(--default-border-radius);
  // background-color: rgba(0, 0, 0, 0.5);
  // backdrop-filter: blur(10px);
}
</style>
