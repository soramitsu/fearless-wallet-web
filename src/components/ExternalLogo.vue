<template>
  <img ref="image" :key="iconName" :src="imageSource" :style="style" :alt="altName" :width="width" :height="fit === 'square' ? width : undefined" loading="lazy" decoding="async" @error="imageFailed" />
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useNetworksStore } from '@/stores/networks';
import fallbackImage from '@/assets/image-placeholder.svg';

type Props = {
  name?: string;
  alt?: string;
  width?: number | string;
  fit?: 'square' | 'natural';
};

const props = withDefaults(defineProps<Props>(), {
  width: 32,
  fit: 'square',
});

const networksStore = useNetworksStore();
const image = ref<HTMLImageElement>();
const failed = ref(false);

const style = computed(() => {
  const styles: Record<string, string> = {};

  if (props.width) {
    styles.width = `${props.width}px`;
    styles.height = props.fit === 'square' ? `${props.width}px` : 'auto';
  }

  return styles;
});

const altName = computed(() => {
  return props.alt ?? '';
});

const iconName = computed(() => {
  if (props.name === undefined || props.name === '') return '';

  if (props.name.startsWith('https://')) return props.name;

  const networkIcon = networksStore.getNetwork(props.name)?.icon;

  return networkIcon || props.name;
});

watch(iconName, () => { failed.value = false; }, { flush: 'sync' });
const imageSource = computed(() => !iconName.value || failed.value ? fallbackImage : iconName.value);
const imageFailed = (event: Event) => {
  if (event.currentTarget !== image.value || imageSource.value === fallbackImage) return;
  failed.value = true;
};
</script>
