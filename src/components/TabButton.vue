<template>
  <div>
    <FCorners>
      <button
        type="button"
        data-testid="tabTitle"
        :class="tabButtonClasses"
        :title="title"
        :role="isTab ? 'tab' : undefined"
        :aria-selected="isTab ? isActive : undefined"
        :aria-pressed="isTab ? undefined : isActive"
        :tabindex="isTab && !isActive ? -1 : 0"
        @click="$emit('click')"
      >
        {{ $t(label) }}
      </button>
    </FCorners>

    <Tooltip v-if="tooltipText" :text="tooltipText" :target="target" :placement="placementTooltip" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Props = {
  label?: string;
  title?: string;
  isActive?: boolean;
  isTab?: boolean;
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
  font-family: inherit;
  color: inherit;
  background-color: $secondary-background-color;
  padding: 0 15px;
  border-radius: 4px;
  font-size: 0.8125em;
  line-height: 36px;
  clip-path: $medium-clip-path-left-top-and-right-bottom;
  border: $default-border;
  min-height: 44px;
  user-select: none;

  &:hover {
    cursor: pointer;
  }
}

.active-background {
  background-color: $pink-purple-color;
}

@include v1-palette {
  .tab-button {
    background: var(--fw-sunken);
    color: var(--fw-text-2);
    border: 1px solid var(--fw-stroke-control);
    border-radius: 12px;
    clip-path: none;
    font-weight: 600;
    line-height: 1.4;
    padding: 10px 16px;
  }
  .active-background {
    background: var(--fw-raised-2);
    border-color: var(--fw-select-edge);
    color: var(--fw-text-1);
  }
  .tab-button:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -3px;
  }
}
</style>
