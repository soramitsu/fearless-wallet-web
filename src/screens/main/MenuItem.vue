<template>
  <div :class="menuItemClasses" data-testid="menuItemStatus">
    <Icon :icon="img" :className="iconClass" :hover="false" />

    <div class="name" data-testid="menuItem">{{ $t(localeName) }}</div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import type { MenuItem as TMenuItem } from '@/interfaces/common';

type Props = {
  name: TMenuItem;
  isActive?: boolean;
};

const props = withDefaults(defineProps<Props>(), { isActive: false });

const iconClass = ['menu-icon'];
const localeName = ref(`menu.${props.name.toLowerCase()}`);

const menuItemClasses = computed(() => ['menu-item', { active: props.isActive }]);
const img = ref(props.name.toLowerCase());
</script>

<style lang="scss" scoped>
.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: $gray-color;
  width: 85px;
  cursor: pointer;

  &:hover {
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
    font-size: 0.8125em;

    &::first-letter {
      text-transform: capitalize;
    }
  }

  .menu-icon {
    height: 24px;
    width: 24px;
    color: $gray-color;

    &:hover {
      color: $plain-white;
      transition: 300ms ease-out;
    }
  }
}

.active {
  color: $plain-white;

  .menu-icon {
    color: $plain-white;
  }
}
</style>
