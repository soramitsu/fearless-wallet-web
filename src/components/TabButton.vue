<template>
  <div>
    <Corners>
      <div :class="tabButtonClasses" :title="title" @click="$emit('click')">
        {{ $t(label) }}
      </div>
    </Corners>

    <Tooltip v-if="tooltipText" :text="tooltipText" :target="target" :placement="placementTooltip" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
type Props = {
  label?: string;
  title?: string;
  isActive?: boolean;
  placementTooltip?: string;
  tooltipText?: string;
  target?: string;
};
defineEmits(['click']);
const props = withDefaults(defineProps<Props>(), {
  label: '',
  title: '',
  placementTooltip: 'top',
  isActive: false,
});

const tabButtonClasses = computed(() => [
  'tab-button',
  {
    'active-background': props.isActive,
  },
]);
</script>

<style lang="scss" scoped>
.tab-button {
  background-color: $secondary-background-color;
  padding: 0 15px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 36px;
  clip-path: $medium-clip-path-left-top-and-right-bottom;
  border: 1px solid $default-background-color;
  height: 36px;
  user-select: none;

  &:hover {
    cursor: pointer;
  }
}

.active-background {
  background-color: $pink-purple-color;
}
</style>
