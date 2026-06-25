<template>
  <FCorners :topLeftCorner="isButton" :bottomRightCorner="isButton">
    <div class="dropdown">
      <button type="button" class="el-button el-dropdown-selfdefine" @click="toggle">
        <span>{{ $t(label) }}</span>
      </button>
      <slot v-if="!isButton"> {{ tooltip }} </slot>
      <div v-if="isOpen" class="el-dropdown-menu">
        <button
          v-for="{ label, value } in filteredOptions"
          :key="label"
          type="button"
          class="el-dropdown-menu__item"
          data-testid="dropdownItem"
          @click="select(value)"
        >
          {{ $t(label) }}
        </button>
      </div>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';

type Options = { value: string; label: string; visibility: boolean }[];

type Props = {
  value?: string;
  options: Options;
  type?: string;
  tooltip?: string;
};

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
  tooltip: 'Menu',
});

const filteredOptions = computed(() =>
  props.options.filter(({ visibility }) => (visibility !== undefined ? visibility : true))
);

const label = computed(() => props.options.find(({ value }) => value === props.value)?.label ?? '');
const isButton = computed(() => props.type === 'button');
const emit = defineEmits(['handler']);
const isOpen = ref(false);

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const select = (value: string) => {
  isOpen.value = false;
  emit('handler', value);
};
</script>

<style lang="scss">
.dropdown {
  .el-button {
    clip-path: $medium-clip-path-left-top-and-right-bottom !important;
    background: none !important;
    border: 1px solid $default-background-color !important;
    color: white !important;
  }

  .el-button span {
    font-feature-settings: var(--s-font-feature-settings-heading);
    font-weight: 400;
    font-size: 0.875em;
  }

  .el-dropdown-selfdefine {
    color: $grayish-white !important;
  }
}

.el-dropdown-menu {
  position: absolute;
  z-index: 20;
  right: 0;
  min-width: 160px;
  padding: 6px 0;
  clip-path: $medium-clip-path-left-top-and-right-bottom;
  background-color: #111111 !important;
  border: 1px solid #111111 !important;
  margin-top: 5px !important;
}

.el-dropdown-menu__item {
  display: block;
  width: 100%;
  background: transparent;
  border: 0;
  padding: 8px 12px;
  text-align: left;
  color: $plain-white !important;

  &:hover {
    background-color: $default-background-color !important;
  }
}

.popper__arrow {
  border-color: #111111 !important;
}

.popper__arrow::after {
  content: none !important;
}
</style>
