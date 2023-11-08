<template>
  <div :class="menuItemClasses">
    <Icon :icon="img" :className="iconClass" />

    <div class="name">{{ $t(localeName) }}</div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import type { MenuItem as TMenuItem } from '@/interfaces/common';

type Props = {
  name: TMenuItem;
  isActive?: boolean;
};
const props = withDefaults(defineProps<Props>(), { isActive: false });

const iconClass = ['menu-icon'];
const localeName = ref(`menu.${props.name.toLowerCase()}`);
const menuItemClasses = ref(['menu-item', { active: props.isActive }]);
const img = ref(props.name.toLowerCase());
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

    &::first-letter {
      text-transform: capitalize;
    }
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
