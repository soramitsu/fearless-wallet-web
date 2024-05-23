<template>
  <FCorners :size="size">
    <div :class="containerSelectClasses">
      <SSelect v-model="vModel" :placeholder="$t(placeholder)" :size="size" :disabled="disabled" data-testid="select">
        <SOption
          v-for="{ value, label } in options"
          :key="label"
          :value="value"
          :label="label"
          data-testid="selectOption"
        />
      </SSelect>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed, defineProps, ref } from 'vue';

type Size = 'small' | 'medium' | 'big';

interface Options {
  label: string;
  value: string;
}

const props = defineProps({
  placeholder: {
    type: String,
    default: '',
  },
  options: {
    type: Array as () => Options[],
    default: () => [],
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  size: {
    type: String as () => Size,
    default: 'medium',
  },
});

const vModel = ref('');

const containerSelectClasses = computed(() => {
  const sizeName = props.size === 'big' ? 'big' : 'medium';

  return [`select-style-default`, `select-size-${sizeName}`];
});
</script>

<style lang="scss" scoped>
.select-style-default {
  input {
    color: $pink-lavender-color !important;
  }

  .s-select .el-input__inner {
    background-color: $secondary-background-color !important;
    border: 1px solid $default-background-color !important;
    padding-top: 25px !important;
  }

  .s-select .s-placeholder {
    color: $default-white !important;
    margin-top: 12px !important;
    padding-left: 25px !important;
  }

  .s-select input {
    padding-left: 25px !important;
  }

  .s-select .el-select i.el-icon-arrow-up:before {
    color: $gray-color !important;
  }
}

.el-select-dropdown {
  background-color: #111111 !important;
  border: 1px solid $default-background-color !important;
  margin-top: 5px !important;
  min-width: 370px !important;
  max-width: 370px !important;
}

.el-select-dropdown__item {
  color: $default-white !important;

  &:hover {
    background-color: $default-background-color !important;
  }
}

.popper__arrow {
  border: 1px solid $default-background-color !important;
}

.selected {
  background-color: $default-background-color !important;
  color: rgba(255, 255, 255, 1) !important;
}

.select-size-big {
  .s-select {
    clip-path: $big-clip-path-left-top-and-right-bottom;
  }
}

.select-size-medium {
  .s-select {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }
}
</style>
