<template>
  <img :src="iconName" :style="style" :alt="altName" :width="width" :height="width" loading="lazy" decoding="async" />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { NetworksController } from '@/controllers';

type Props = {
  name?: string;
  alt?: string;
  width?: number;
};

const props = withDefaults(defineProps<Props>(), {
  width: 32,
});

const style = computed(() => {
  const styles: Record<string, string> = {};

  if (props.width) {
    styles.width = `${props.width}px`;
    styles.height = `${props.width}px`;
  }

  return styles;
});

const altName = computed(() => props.alt ?? props.name);

const iconName = computed(() => {
  if (props.name === undefined || props.name === '') return '';

  if (props.name.startsWith('https://')) return props.name;

  const networkIcon = NetworksController.getNetwork(props.name)?.icon;

  return networkIcon || props.name;
});
</script>
