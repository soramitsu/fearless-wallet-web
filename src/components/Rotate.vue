<template>
  <div :class="classes">
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onActivated } from 'vue';

type Props = {
  isActive: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
});

const notFirstOpening = ref(false);

const classes = computed(() => [
  {
    rotate: props.isActive,
    'non-rotate': !props.isActive && notFirstOpening.value,
  },
]);

watch(
  () => props.isActive,
  () => (notFirstOpening.value = true)
);

onActivated(() => {
  notFirstOpening.value = false;
});
</script>

<style lang="scss" scoped>
.rotate {
  @include rotate180deg;
}

.non-rotate {
  @include rotate180degReverse;
}
</style>
