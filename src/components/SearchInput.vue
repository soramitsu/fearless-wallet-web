<template>
  <div class="search-input-wrapper" data-testid="searchInput" @keydown="searchKeydown">
    <div class="search-field" :style="inputStyle">
      <FInput
        ref="field"
        :value="value"
        :placeholder="placeholder || 'common.search'"
        size="small"
        @change="changeInputValue"
      />
      <Icon v-if="!value" icon="search" className="search-icon" aria-hidden="true" />
      <button
        v-if="value"
        type="button"
        class="search-clear"
        :aria-label="`${$t(placeholder || 'common.search')}: ${$t('browserTabs.reset')}`"
        data-testid="clearSearch"
        @click="clearSearch"
      >
        <Icon icon="close" width="24px" height="24px" :hover="false" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue';

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
const field = ref<{ input: HTMLInputElement | null } | null>(null);

const clearSearch = async () => {
  emit('change', '');
  await nextTick();
  field.value?.input?.focus();
};

const searchKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !props.value || event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  void clearSearch();
};

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
  .el-input__inner {
    display: block;
    padding-right: 52px !important;
  }
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

  .search-clear {
    position: absolute;
    right: 2px;
    bottom: 2px;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 12px;
    border: 0;
    border-radius: 12px;
    color: var(--fw-text-2);
    background: transparent;
    cursor: pointer;
    &:focus-visible {
      outline: 2px solid var(--fw-focus);
      outline-offset: -3px;
    }
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
      margin-bottom: 0;
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
