<template>
  <img :src="iconName" :style="style" :alt="altName" :width="width" :height="width" loading="lazy" decoding="async" />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useStore } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

type Props = {
  name?: string;
  alt?: string;
  width?: number | string;
};

const props = withDefaults(defineProps<Props>(), {
  width: 32,
});

const store = useStore();

const style = computed(() => {
  const styles: Record<string, string> = {};

  if (props.width) {
    styles.width = `${props.width}px`;
    styles.height = `${props.width}px`;
  }

  return styles;
});

const altName = computed(() => {
  return props.alt ?? '';
});

const iconName = computed(() => {
  if (props.name === undefined || props.name === '') return '';

  if (props.name.startsWith('https://')) return props.name;

  const networkIcon = store.getters[NetworksGettersTypes.getNetwork](props.name)?.icon;

  return networkIcon || props.name;
});
</script>
