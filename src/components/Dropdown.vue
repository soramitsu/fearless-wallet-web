<template>
  <FCorners :topLeftCorner="showCorners" :bottomRightCorner="showCorners">
    <SDropdown
      :type="type"
      buttonType="secondary"
      trigger="click"
      placement="bottom-end"
      class="dropdown"
      size="mini"
      @select="$emit('handler', ...arguments)"
    >
      {{ $t(label) }}

      <template slot="menu">
        <SDropdownItem v-for="{ label, value } in filteredOptions" :key="label" :value="value">
          {{ $t(label) }}
        </SDropdownItem>
      </template>

      <slot> {{ tooltip }} </slot>
    </SDropdown>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

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
const showCorners = computed(() => props.type === 'button');
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
    font-size: 14px;
  }

  .el-dropdown-selfdefine {
    color: $grayish-white !important;
  }
}

.el-dropdown-menu {
  clip-path: $medium-clip-path-left-top-and-right-bottom;
  background-color: #111111 !important;
  border: 1px solid #111111 !important;
  margin-top: 5px !important;
}

.el-dropdown-menu__item {
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
