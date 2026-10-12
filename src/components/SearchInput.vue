<template>
  <div class="search-input-wrapper" data-testid="searchInput">
    <div class="search-field" :style="inputStyle">
      <FInput
        :value="value"
        :placeholder="placeholder || 'common.search'"
        size="small"
        @change="changeInputValue"
      />
      <Icon icon="search" className="search-icon" aria-hidden="true" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

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
  position: relative;
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

  .search-field {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    max-width: 100%;
  }

  .search-icon {
    color: $gray-color;
    width: 20px;
    height: 20px;
    margin-left: -30px;
  }
}
@include v1-palette {
  .search-input-wrapper {
    min-width: 0;
    flex: 0 1 auto;
    :deep(.FCorners) {
      max-width: 100%;
      width: 100%;
    }
    :deep(.el-input__inner) {
      padding-left: 42px !important;
      border-radius: 24px;
    }
    .search-icon {
      position: absolute;
      left: 16px;
      bottom: 17px;
      margin: 0;
      pointer-events: none;
      color: var(--fw-text-2);
    }
  }
}
</style>
