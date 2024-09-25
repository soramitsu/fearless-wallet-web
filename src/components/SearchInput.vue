<template>
  <div class="search-input-wrapper" data-testid="searchInput">
    <FInput :value="value" :placeholder="placeholder" size="small" :style="inputStyle" @change="changeInputValue" />

    <SIcon name="basic-search-24" />
  </div>
</template>

<script lang="ts" setup>
import { withDefaults, computed } from 'vue';

interface Props {
  value: string;
  placeholder: string;
  width: string;
}

const props = withDefaults(defineProps<Props>(), {
  value: '',
  placeholder: '',
  width: '',
});

const emit = defineEmits(['change']);

const changeInputValue = (newValue: string) => {
  emit('change', newValue);
};

const inputStyle = computed(() => {
  const styles: Record<string, string> = {};

  if (props.width) styles.width = `${props.width}`;

  return styles;
});
</script>

<style lang="scss">
.search-input-wrapper {
  .s-input__input {
    width: calc(100% - 20px);
    flex: none;
  }
}
</style>

<style lang="scss" scoped>
.search-input-wrapper {
  display: flex;
  align-items: center;
  user-select: none;

  .s-icon-basic-search-24 {
    color: $gray-color;
    font-size: 1.25em !important;
    margin-left: -30px;
  }
}
</style>
