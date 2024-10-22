<template>
  <SSwitch
    v-model="vModel"
    class="switch"
    data-testid="switch"
    :activeText="activeText"
    :inactiveText="inactiveText"
    :disabled="disabled"
  />
</template>

<script lang="ts" setup>
import { computed } from 'vue';

interface Props {
  value: boolean;
  activeText?: string;
  inactiveText?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  value: false,
  activeText: '',
  inactiveText: '',
  disabled: false,
});

const emit = defineEmits(['change']);

const vModel = computed({
  get: () => props.value,
  set: (value: boolean) => emit('change', value),
});

const activeText = computed(() => props.activeText);
const inactiveText = computed(() => props.inactiveText);
const disabled = computed(() => props.disabled);
</script>

<style lang="scss">
.el-switch__core {
  background-color: #422539 !important;
  border: 1px solid $default-background-color !important;
}

.is-checked {
  .el-switch__core {
    background-color: #7700ee !important;
    border: 1px solid $default-background-color !important;
  }
}
</style>
