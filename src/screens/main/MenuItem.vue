<template>
  <button :class="menuItemClasses" type="button" data-testid="menuItemStatus" :aria-current="isActive ? 'page' : undefined">
    <span class="icon-shell">
      <Icon :icon="icon" :className="iconClass" :hover="false" />
    </span>

    <span class="name" data-testid="menuItem">{{ name }}</span>
  </button>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Props = {
  name: string;
  icon: string;
  isActive?: boolean;
  emphasized?: boolean;
};

const props = withDefaults(defineProps<Props>(), { isActive: false, emphasized: false });

const iconClass = ['menu-icon'];
const menuItemClasses = computed(() => ['menu-item', { active: props.isActive, emphasized: props.emphasized }]);
</script>

<style lang="scss" scoped>
.menu-item {
  appearance: none;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  border: 0;
  padding: 0 2px;
  background: transparent;
  color: $gray-color;
  cursor: pointer;
  font: inherit;

  &:hover {
    color: $plain-white;
    transition: 300ms ease-out;

    .menu-icon {
      color: $plain-white;
      transition: 300ms ease-out;
    }
  }

  .name {
    font-weight: 600;
    font-size: 0.61rem;
    line-height: 1.15;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

.icon-shell {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  transition: transform 160ms ease, background-color 160ms ease;
}

.emphasized {
  .icon-shell {
    width: 48px;
    height: 48px;
    margin-top: -22px;
    background: $pink-lavender-color;
    box-shadow: 0 0 0 5px #111;
  }

  .menu-icon {
    color: #111;
  }
}

.active {
  color: $plain-white;

  .menu-icon {
    color: $plain-white;
  }

  &.emphasized .menu-icon {
    color: #111;
  }
}
</style>
