<template>
  <div class="menu">
    <MenuItem
      v-for="menuItem in menuItems"
      :key="menuItem"
      :name="menuItem"
      :isActive="menuItem === selectedItem"
      @click.native="clickMenuItem(menuItem)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import MenuItem from './MenuItem.vue';

type MenuItems = ['Wallet', 'Crowdloans', 'Stacking', 'DEX', 'History'];

@Component({
  components: { MenuItem },
})
export default class extends Vue {
  menuItems: MenuItems = ['Wallet', 'Crowdloans', 'Stacking', 'DEX', 'History'];
  selectedItem = 'Wallet';

  clickMenuItem(name: string) {
    if (this.selectedItem === name) return;

    this.selectedItem = name;
  }
}
</script>

<style lang="scss" scoped>
.menu {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 80px;
  width: 100%;
  backdrop-filter: blur(16px);
  border-top: 1px solid white;
}
</style>
