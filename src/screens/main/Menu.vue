<template>
  <div class="menu">
    <MenuItem
      v-for="menuItem in menuItems"
      :key="menuItem"
      :name="menuItem"
      :isActive="menuItem === currentRouteName"
      @click.native="clickMenuItem(menuItem)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Components } from '../../router/routes';
import MenuItem from '../../components/MenuItem.vue';

type MenuItems = 'Wallet' | 'Crowdloans' | 'Stacking' | 'DEX' | 'History';

@Component({
  components: { MenuItem },
})
export default class extends Vue {
  menuItems: MenuItems[] = ['Wallet', 'Crowdloans', 'Stacking', 'DEX', 'History'];
  selectedItem = 'Wallet';

  get currentRouteName() {
    return this.$route.name;
  }

  clickMenuItem(name: MenuItems) {
    if (this.currentRouteName === name) return;

    this.$router.push({ name: Components[name] });
  }
}
</script>

<style lang="scss" scoped>
.menu {
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 200;
  height: 80px;
  width: 560px;
  margin: 0 0 -16px -16px;
  border-radius: 0 0 var(--default-border-radius) var(--default-border-radius);
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(5px);
}
</style>
