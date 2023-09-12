<template>
  <Corners>
    <SDropdown
      type="button"
      buttonType="secondary"
      trigger="click"
      class="dropdown"
      size="mini"
      @select="$emit('handler')"
    >
      {{ $t(label) }}

      <template slot="menu">
        <SDropdownItem v-for="{ label, value } in options" :key="label" :value="value">
          {{ $t(label) }}
        </SDropdownItem>
      </template>
    </SDropdown>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Dropdown extends Vue {
  @Prop(String) value!: string;
  @Prop(Array) options!: Record<string, string>[];

  get label() {
    return this.options.find(({ value }) => value === this.value)?.label ?? '';
  }
}
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
