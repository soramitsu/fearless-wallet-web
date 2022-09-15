<template>
  <div :class="menuItemClasses">
    <img :src="img" class="menu-icon" />

    <div class="name">
      {{ name }}
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { MenuItem as TMenuItem } from '@/interfaces/common';
import { MenuItems } from '@/interfaces/common';

@Component({
  components: {},
})
export default class MenuItem extends Vue {
  @Prop(String) name!: TMenuItem;
  @Prop({ default: false }) isActive!: boolean;

  get menuItemClasses() {
    return ['menu-item', { active: this.isActive }];
  }

  get img() {
    const fileName = this.name === MenuItems.dex ? 'polkaswap' : this.name.toLowerCase();

    return require(`@/assets/${fileName}.svg`);
  }
}
</script>

<style lang="scss" scoped>
.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: rgba(255, 255, 255, 0.5);
  width: 85px;

  &:hover {
    cursor: pointer;
    color: #fff;
    transition: 300ms ease-out;

    .menu-icon {
      filter: invert(0);
      transition: 300ms ease-out;
    }
  }

  .name {
    margin-top: 8px;
    font-weight: 600;
    font-size: 13px;
  }

  .menu-icon {
    height: 24px;
    width: 24px;
    filter: invert(0.45);
  }
}

.active {
  color: #fff;

  .menu-icon {
    filter: invert(0);
  }
}
</style>
