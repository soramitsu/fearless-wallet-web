<template>
  <div :class="menuItemClasses">
    <Icon :icon="img" :className="iconClass" />

    <div class="name">{{ $t(localeName) }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { MenuItem as TMenuItem } from '@/interfaces/common';

@Component
export default class MenuItem extends Vue {
  iconClass = ['menu-icon'];

  @Prop(String) name!: TMenuItem;
  @Prop({ default: false }) isActive!: boolean;

  get localeName() {
    return `menu.${this.name}`;
  }

  get menuItemClasses() {
    return ['menu-item', { active: this.isActive }];
  }

  get img() {
    return this.name.toLowerCase();
  }
}
</script>

<style lang="scss" scoped>
.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: $gray-color;
  width: 85px;

  &:hover {
    cursor: pointer;
    color: $plain-white;
    transition: 300ms ease-out;

    .menu-icon {
      color: $plain-white;
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
    color: $gray-color;
  }
}

.active {
  color: $plain-white;

  .menu-icon {
    color: $plain-white;
  }
}
</style>
