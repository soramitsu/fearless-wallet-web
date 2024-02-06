<template>
  <SCheckbox class="fw-checkbox" v-model.lazy="vmodel" :size="size" :label="label" data-testid="checkbox" />
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Props = {
  label: string;
  value: boolean;
  size?: 'medium' | 'big';
};

const props = withDefaults(defineProps<Props>(), { size: 'medium' });
const emit = defineEmits(['change']);

const vmodel = computed({
  get: () => props.value,
  set: (value: boolean) => emit('change', value),
});
</script>

<style lang="scss">
.fw-checkbox {
  border-color: $default-white !important;
  border-radius: 3px !important;

  .el-checkbox__input > .el-checkbox__inner {
    border-color: transparent;
    border-radius: 5px;
  }

  .el-checkbox__input.is-focus > .el-checkbox__inner {
    border-color: $purple-color;
  }

  .el-checkbox__inner:hover {
    border-color: $purple-color;
  }

  .el-checkbox__input.is-checked > .el-checkbox__inner {
    background-color: $purple-color;
    border-color: $purple-color;
  }

  .el-checkbox__inner {
    background-color: $default-background-color;
  }

  .el-checkbox__label {
    color: $default-white !important;
  }
}
</style>
