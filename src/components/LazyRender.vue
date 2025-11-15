<template>
  <div ref="targetRef" data-testid="lazy" @click="emitClick">
    <slot v-if="shouldRender" />

    <Shimmer v-else-if="isTimeout" height="100%" width="100%" />
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';

type Props = {
  threshold?: number;
  root?: Element | Document | null;
  rootMargin?: string;
  timeoutCallback?: (fn: () => void) => VoidFunction | undefined;
};

const props = withDefaults(defineProps<Props>(), {
  threshold: 0,
  root: null,
  rootMargin: '0px',
  timeoutCallback: undefined,
});

const targetRef = ref<Element | null>(null);
const shouldRender = ref(false);
const isTimeout = computed(() => props.timeoutCallback !== undefined);

const options = computed<IntersectionObserverInit>(() => ({
  root: props.root,
  threshold: props.threshold,
  rootMargin: props.rootMargin,
}));

const setShouldRender = () => (shouldRender.value = true);

const emit = defineEmits<{
  (_event: 'click', _payload: MouseEvent): void;
}>();

const emitClick = (payload: MouseEvent) => {
  emit('click', payload);
};

onMounted(() => {
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(({ isIntersecting }) => {
      if (!isIntersecting) return;

      if (isTimeout.value && props.timeoutCallback) props.timeoutCallback(setShouldRender);
      else setShouldRender();

      observer.unobserve(targetRef.value!);
    });
  }, options.value);

  observer.observe(targetRef.value!);
});
</script>
